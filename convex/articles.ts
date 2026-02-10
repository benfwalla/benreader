"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export const fetch = action({
  args: { url: v.string() },
  returns: v.union(
    v.object({
      title: v.string(),
      content: v.string(),
      excerpt: v.optional(v.string()),
      byline: v.optional(v.string()),
      siteName: v.optional(v.string()),
      length: v.number(),
    }),
    v.null()
  ),
  handler: async (_ctx, args) => {
    try {
      const response = await globalThis.fetch(args.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });

      if (!response.ok) return null;

      const html = await response.text();
      const { document } = parseHTML(html);

      // Set the URL for relative link resolution
      const base = document.createElement("base");
      base.setAttribute("href", args.url);
      document.head.appendChild(base);

      const reader = new Readability(document as any);
      const article = reader.parse();

      if (!article || !article.content) return null;

      return {
        title: article.title || "Untitled",
        content: article.content,
        excerpt: article.excerpt || undefined,
        byline: article.byline || undefined,
        siteName: article.siteName || undefined,
        length: article.length || 0,
      };
    } catch (e) {
      console.error("Failed to fetch article:", e);
      return null;
    }
  },
});
