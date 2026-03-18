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

// Fetch a feed's RSS and return parsed posts (no DB writes except feed image)
export const fetchFeed = action({
  args: { feedId: v.id("brFeeds") },
  returns: v.array(postValidator),
  handler: async (ctx, args) => {
    const feed = await ctx.runQuery(api.feeds.get, { feedId: args.feedId });
    if (!feed) return [];

    try {
      const posts = await parseFeedXml(feed.xmlUrl);

      // Update feed image if missing
      if (posts.length > 0 && !feed.imageUrl) {
        const response = await fetch(feed.xmlUrl, {
          headers: { "User-Agent": "BenReader/1.0" },
          signal: AbortSignal.timeout(15000),
        });
        if (response.ok) {
          const xml = await response.text();
          const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
          const parsed = parser.parse(xml);
          const channel = parsed.rss?.channel || parsed.feed;
          const feedImage = channel?.image?.url || channel?.["itunes:image"]?.["@_href"] || channel?.logo || channel?.icon;
          if (feedImage) {
            await ctx.runMutation(api.feeds.updateImage, { feedId: args.feedId, imageUrl: String(feedImage) });
          }
        }
      }

      return posts;
    } catch (e) {
      console.error(`Failed to fetch feed ${feed.title}:`, e);
      return [];
    }
  },
});

// Lightweight refresh for when adding a feed — just updates feed image
export const refreshFeed = action({
  args: { feedId: v.id("brFeeds") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const feed = await ctx.runQuery(api.feeds.get, { feedId: args.feedId });
    if (!feed) return null;

    try {
      const response = await fetch(feed.xmlUrl, {
        headers: { "User-Agent": "BenReader/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return null;

      const xml = await response.text();
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
      const parsed = parser.parse(xml);
      const channel = parsed.rss?.channel || parsed.feed;
      if (!channel) return null;

      const feedImage = channel.image?.url || channel["itunes:image"]?.["@_href"] || channel.logo || channel.icon;
      if (feedImage && !feed.imageUrl) {
        await ctx.runMutation(api.feeds.updateImage, { feedId: args.feedId, imageUrl: String(feedImage) });
      }
    } catch (e) {
      console.error(`Failed to refresh feed ${feed.title}:`, e);
    }

    return null;
  },
});

// Keep refreshAll as a no-op for the cron (feeds are fetched client-side now)
export const refreshAll = action({
  args: {},
  returns: v.null(),
  handler: async () => {
    // No-op: feeds are fetched on demand by the client
    return null;
  },
});

// ─── RSS Parsing (shared logic) ───

async function parseFeedXml(xmlUrl: string) {
  const response = await fetch(xmlUrl, {
    headers: { "User-Agent": "BenReader/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) return [];

  const xml = await response.text();
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const parsed = parser.parse(xml);

  const channel = parsed.rss?.channel || parsed.feed;
  if (!channel) return [];

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

    let imageUrl = item["media:content"]?.["@_url"] || item["media:thumbnail"]?.["@_url"] || item.enclosure?.["@_url"] || undefined;

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

  return posts;
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
