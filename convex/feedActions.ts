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

      // Extract brand color from favicon if not already set
      if (!feed.brandColor) {
        try {
          const hostname = new URL(feed.htmlUrl || feed.xmlUrl).hostname;
          const faviconResp = await fetch(
            `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (faviconResp.ok) {
            const buf = await faviconResp.arrayBuffer();
            const color = extractDominantColorFromPNG(new Uint8Array(buf));
            if (color) {
              await ctx.runMutation(api.feeds.updateBrandColor, {
                feedId: args.feedId,
                brandColor: color,
              });
            }
          }
        } catch {}
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

// Simple PNG/ICO pixel color extraction without image libraries
// Parses raw favicon bytes looking for colorful pixels
function extractDominantColorFromPNG(bytes: Uint8Array): string | null {
  // For ICO/PNG favicons, we can't easily decode without a library
  // Instead, scan raw bytes for common RGB patterns
  // Look for sequences of bytes that could be pixel data
  const counts = new Map<string, number>();
  
  // Scan through bytes in groups of 3-4 (RGB/RGBA pixel data)
  // This is a heuristic that works for uncompressed sections
  for (let i = 0; i < bytes.length - 3; i++) {
    const r = bytes[i], g = bytes[i + 1], b = bytes[i + 2];
    
    // Skip near-white, near-black, and gray
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    if (brightness > 240 || brightness < 15) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 30) continue; // skip grays
    
    // Quantize
    const qr = Math.round(r / 32) * 32;
    const qg = Math.round(g / 32) * 32;
    const qb = Math.round(b / 32) * 32;
    const key = `${qr},${qg},${qb}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  
  if (counts.size === 0) return null;
  
  let maxCount = 0, dominant = "";
  counts.forEach((count, key) => {
    if (count > maxCount) { maxCount = count; dominant = key; }
  });
  
  // Need a minimum occurrence to be meaningful
  if (maxCount < 5) return null;
  
  let [r, g, b] = dominant.split(",").map(Number);
  
  // Ensure readable against #F5F0E8 (lum ~0.88) — need 3:1 contrast
  for (let i = 0; i < 20; i++) {
    const lum = relativeLuminance(r, g, b);
    const bgLum = 0.88;
    const ratio = (bgLum + 0.05) / (lum + 0.05);
    if (ratio >= 3) break;
    r = Math.round(r * 0.85);
    g = Math.round(g * 0.85);
    b = Math.round(b * 0.85);
  }
  
  // Convert to hex
  const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  return hex;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const rs = r / 255, gs = g / 255, bs = b / 255;
  const rl = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  const gl = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  const bl = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

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
