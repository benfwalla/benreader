"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
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
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
      });
      const parsed = parser.parse(xml);

      const channel = parsed.rss?.channel || parsed.feed;
      if (!channel) return null;

      // Extract feed image/logo
      const feedImage =
        channel.image?.url ||
        channel["itunes:image"]?.["@_href"] ||
        channel.logo ||
        channel.icon ||
        undefined;
      if (feedImage && !feed.imageUrl) {
        await ctx.runMutation(api.feeds.updateImage, {
          feedId: args.feedId,
          imageUrl: String(feedImage),
        });
      }

      let items = channel.item || channel.entry || [];
      if (!Array.isArray(items)) items = [items];

      // Detect Substack: either substack.com domain or RSS content hints
      const xmlLower = xml.toLowerCase();
      const isSubstack = feed.xmlUrl.includes("substack.com") || 
        xmlLower.includes("substack") ||
        xmlLower.includes("substackcdn.com");
      const posts = [];

      for (const item of items.slice(0, 50)) {
        const title = item.title || "Untitled";
        const link = item.link?.["@_href"] || item.link || item.url || "";
        const guid =
          item.guid?.["#text"] || item.guid || item.id || link || title;
        const pubDate = item.pubDate || item.published || item.updated;
        const publishedAt = pubDate ? new Date(pubDate).getTime() : Date.now();

        let content =
          item["content:encoded"] ||
          item.description ||
          item.summary ||
          item.content?.["#text"] ||
          item.content ||
          "";
        if (typeof content === "object") content = "";
        const contentText = String(content).replace(/<[^>]*>/g, "");
        const wordCount = contentText.split(/\s+/).filter((w: string) => w.length > 0).length;
        content = contentText.slice(0, 300);

        let imageUrl =
          item["media:content"]?.["@_url"] ||
          item["media:thumbnail"]?.["@_url"] ||
          item.enclosure?.["@_url"] ||
          undefined;

        // Extract author as string
        let author: string | undefined;
        const rawAuthor = item.author || item["dc:creator"];
        if (rawAuthor) {
          if (typeof rawAuthor === "string") {
            author = rawAuthor;
          } else if (typeof rawAuthor === "object" && rawAuthor.name) {
            author = String(rawAuthor.name);
          } else if (typeof rawAuthor === "object") {
            // Skip objects we can't parse
            author = undefined;
          }
        }

        // Extract title as string
        let titleStr: string;
        if (typeof title === "string") {
          titleStr = title;
        } else if (typeof title === "object" && title?.["#text"]) {
          titleStr = String(title["#text"]);
        } else {
          titleStr = String(title) || "Untitled";
        }

        let isPaywalled = false;
        if (isSubstack && link) {
          try {
            const pageResp = await fetch(String(link), {
              headers: { "User-Agent": "BenReader/1.0" },
              signal: AbortSignal.timeout(10000),
            });
            if (pageResp.ok) {
              const html = await pageResp.text();
              isPaywalled =
                html.includes('class="paywall"') ||
                html.includes('class="paywall-bar"') ||
                html.includes('"isAccessibleForFree":false') ||
                html.includes("This post is for paid subscribers") ||
                html.includes("Subscribe to continue reading");
            }
          } catch {
            // ignore
          }
        }

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
        });
      }

      if (posts.length > 0) {
        await ctx.runMutation(internal.feeds.upsertPosts, {
          feedId: args.feedId,
          posts,
        });
      }
    } catch (e) {
      console.error(`Failed to refresh feed ${feed.title}:`, e);
    }

    return null;
  },
});

export const refreshAll = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const feeds = await ctx.runQuery(api.feeds.list, {});
    for (const feed of feeds) {
      try {
        await ctx.runAction(api.feedActions.refreshFeed, {
          feedId: feed._id,
        });
      } catch (e) {
        console.error(`Failed to refresh ${feed.title}:`, e);
      }
    }
    return null;
  },
});
