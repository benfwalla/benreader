import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

export const maxDuration = 30;

// Fetches and parses an RSS/Atom feed. Lives on Vercel instead of a Convex
// action so feed bandwidth doesn't count against the Convex free tier.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  try {
    const result = await fetchAndParse(url);
    if (!result) return NextResponse.json({ error: "unreachable or not a feed" }, { status: 502 });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}

/* ─── Channel metadata ─── */

function textOf(node: unknown): string | undefined {
  if (typeof node === "string" && node) return node;
  if (node && typeof node === "object" && "#text" in (node as Record<string, unknown>)) {
    const t = (node as Record<string, unknown>)["#text"];
    if (t) return String(t);
  }
  return undefined;
}

function channelLink(channel: any): string | undefined {
  const link = channel.link;
  if (Array.isArray(link)) {
    const alt = link.find((l: any) => l["@_rel"] === "alternate") || link.find((l: any) => l["@_href"]);
    return alt?.["@_href"];
  }
  if (typeof link === "string" && link.startsWith("http")) return link;
  return link?.["@_href"];
}

function channelMeta(channel: any): { title?: string; htmlUrl?: string; imageUrl?: string } {
  const image = channel.image?.url || channel["itunes:image"]?.["@_href"] || channel.logo || channel.icon;
  return {
    title: textOf(channel.title),
    htmlUrl: channelLink(channel),
    imageUrl: image ? String(textOf(image) ?? image) : undefined,
  };
}

/* ─── RSS Parsing ─── */

async function fetchAndParse(xmlUrl: string) {
  const response = await fetch(xmlUrl, {
    headers: { "User-Agent": "BenReader/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) return null;

  const xml = await response.text();
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const parsed = parser.parse(xml);

  const channel = parsed.rss?.channel || parsed.feed;
  if (!channel) return null;

  let items = channel.item || channel.entry || [];
  if (!Array.isArray(items)) items = [items];

  const xmlLower = xml.toLowerCase();
  const isSubstack = xmlUrl.includes("substack.com") || xmlLower.includes("substack") || xmlLower.includes("substackcdn.com");

  const posts = [];

  for (const item of items.slice(0, 100)) {
    const title = item.title || "Untitled";
    let link: string | object = "";
    if (Array.isArray(item.link)) {
      const alt = item.link.find((l: any) => l["@_rel"] === "alternate");
      const withHref = item.link.find((l: any) => l["@_href"]);
      link = (alt?.["@_href"] || withHref?.["@_href"] || "") as string;
    } else {
      link = item.link?.["@_href"] || item.link || item.url || "";
    }
    const guid = item.guid?.["#text"] || item.guid || item.id || link || title;
    const pubDate = item.pubDate || item.published || item.updated;
    const publishedAt = pubDate ? new Date(pubDate).getTime() : Date.now();

    let rawContent = item["content:encoded"] || item.description || item.summary || item.content?.["#text"] || item.content || "";
    if (typeof rawContent === "object") rawContent = "";
    const rawContentStr = String(rawContent);
    const contentText = rawContentStr.replace(/<[^>]*>/g, "");
    const wordCount = contentText.split(/\s+/).filter((w: string) => w.length > 0).length;
    const content = contentText.slice(0, 300);
    const rssContent = rawContentStr.length > 100 ? rawContentStr : undefined;

    const imageUrl = item["media:content"]?.["@_url"] || item["media:thumbnail"]?.["@_url"] || item.enclosure?.["@_url"] || undefined;

    let author: string | undefined;
    const rawAuthor = item.author || item["dc:creator"];
    if (rawAuthor) {
      if (typeof rawAuthor === "string") author = rawAuthor;
      else if (typeof rawAuthor === "object" && rawAuthor.name) author = String(rawAuthor.name);
    }

    let titleStr: string;
    if (typeof title === "string") titleStr = title;
    else if (typeof title === "object" && title?.["#text"]) titleStr = String(title["#text"]);
    else titleStr = String(title) || "Untitled";

    const isPaywalled = detectPaywall(rawContentStr, item, isSubstack);

    posts.push({
      title: titleStr,
      url: typeof link === "object" ? "" : String(link),
      content: content || undefined,
      imageUrl,
      publishedAt: isNaN(publishedAt) ? Date.now() : publishedAt,
      guid: String(guid),
      author,
      isPaywalled,
      wordCount: wordCount > 0 ? wordCount : undefined,
      rssContent,
    });
  }

  return { meta: channelMeta(channel), posts };
}

function detectPaywall(contentHtml: string, item: any, isSubstack: boolean): boolean {
  const lower = contentHtml.toLowerCase();
  if (lower.includes('class="paywall"') || lower.includes('class="paywall-bar"') || lower.includes("this post is for paid subscribers") || lower.includes("subscribe to continue reading") || lower.includes("this post is for paying subscribers") || lower.includes("upgrade to paid")) return true;
  if (lower.includes('"isaccessibleforfree":false') || lower.includes('"isaccessibleforfree": false')) return true;
  if (item["schema:isAccessibleForFree"] === "False" || item["schema:isAccessibleForFree"] === false) return true;
  if (isSubstack && contentHtml.length > 0) {
    const trimmed = contentHtml.trim();
    const hasReadMore = /Read more\s*<\/a>\s*<\/p>\s*$/i.test(trimmed);
    const hasFullContent = lower.includes('class="subscription-widget') || lower.includes('class="footnote"');
    if (hasReadMore && !hasFullContent) return true;
  }
  return false;
}
