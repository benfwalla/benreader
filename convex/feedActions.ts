"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { XMLParser } from "fast-xml-parser";

export const importOPML = action({
  args: { opmlXml: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
    const parsed = parser.parse(args.opmlXml);

    const body = parsed.opml.body;
    let outlines = body.outline;
    if (!Array.isArray(outlines)) outlines = [outlines];

    for (let i = 0; i < outlines.length; i++) {
      const folder = outlines[i];
      const folderName =
        folder["@_title"] || folder["@_text"] || "Uncategorized";

      const folderId = await ctx.runMutation(api.folders.create, {
        name: folderName,
        order: i,
      });

      let feeds = folder.outline;
      if (!feeds) continue;
      if (!Array.isArray(feeds)) feeds = [feeds];

      for (const feed of feeds) {
        const xmlUrl = feed["@_xmlUrl"];
        if (!xmlUrl) continue;

        await ctx.runMutation(api.feeds.add, {
          title: feed["@_title"] || feed["@_text"] || xmlUrl,
          xmlUrl,
          htmlUrl: feed["@_htmlUrl"] || "",
          folderId,
        });
      }
    }

    return null;
  },
});

const postValidator = v.object({
  title: v.string(),
  url: v.string(),
  content: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  publishedAt: v.number(),
  guid: v.string(),
  author: v.optional(v.string()),
  isPaywalled: v.boolean(),
  wordCount: v.optional(v.number()),
  rssContent: v.optional(v.string()),
});

// Fetch a feed's RSS and return parsed posts (no DB writes except feed metadata backfill)
export const fetchFeed = action({
  args: { feedId: v.id("brFeeds") },
  returns: v.array(postValidator),
  handler: async (ctx, args) => {
    const feed = await ctx.runQuery(api.feeds.get, { feedId: args.feedId });
    if (!feed) return [];

    try {
      const result = await fetchAndParse(feed.xmlUrl);
      if (!result) return [];

      const meta = buildMetaPatch(feed, result.channel);
      if (meta) await ctx.runMutation(api.feeds.updateMeta, { feedId: args.feedId, ...meta });

      return result.posts;
    } catch (e) {
      console.error(`Failed to fetch feed ${feed.title}:`, e);
      return [];
    }
  },
});

// Backfill feed metadata (title, site link, image) — used right after adding a feed
export const refreshFeed = action({
  args: { feedId: v.id("brFeeds") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const feed = await ctx.runQuery(api.feeds.get, { feedId: args.feedId });
    if (!feed) return null;

    try {
      const result = await fetchAndParse(feed.xmlUrl);
      if (!result) return null;
      const meta = buildMetaPatch(feed, result.channel);
      if (meta) await ctx.runMutation(api.feeds.updateMeta, { feedId: args.feedId, ...meta });
    } catch (e) {
      console.error(`Failed to refresh feed ${feed.title}:`, e);
    }

    return null;
  },
});

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

// Only fills in metadata that's missing or was never resolved (title === xmlUrl)
function buildMetaPatch(
  feed: { title: string; xmlUrl: string; htmlUrl: string; imageUrl?: string },
  channel: any
): { title?: string; htmlUrl?: string; imageUrl?: string } | null {
  const patch: { title?: string; htmlUrl?: string; imageUrl?: string } = {};

  if (feed.title === feed.xmlUrl) {
    const title = textOf(channel.title);
    if (title) patch.title = title;
  }
  if (!feed.htmlUrl || feed.htmlUrl === feed.xmlUrl) {
    const htmlUrl = channelLink(channel);
    if (htmlUrl && htmlUrl !== feed.htmlUrl) patch.htmlUrl = htmlUrl;
  }
  if (!feed.imageUrl) {
    const image = channel.image?.url || channel["itunes:image"]?.["@_href"] || channel.logo || channel.icon;
    if (image) patch.imageUrl = String(textOf(image) ?? image);
  }

  return Object.keys(patch).length ? patch : null;
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

  return { channel, posts };
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
