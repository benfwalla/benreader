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
