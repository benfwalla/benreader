import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("brFeeds").collect();
  },
});

export const get = query({
  args: { feedId: v.id("brFeeds") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.feedId);
  },
});

export const add = mutation({
  args: {
    title: v.string(),
    xmlUrl: v.string(),
    htmlUrl: v.string(),
    folderId: v.id("brFolders"),
  },
  returns: v.id("brFeeds"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("brFeeds", {
      title: args.title,
      xmlUrl: args.xmlUrl,
      htmlUrl: args.htmlUrl,
      folderId: args.folderId,
    });
  },
});

export const updateMeta = mutation({
  args: {
    feedId: v.id("brFeeds"),
    title: v.optional(v.string()),
    htmlUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { feedId, ...fields } = args;
    const patch = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined)
    );
    if (Object.keys(patch).length) await ctx.db.patch(feedId, patch);
    return null;
  },
});

// brandColor: hex string to set, or omit to clear a bad/stale color
export const setBrandColor = mutation({
  args: { feedId: v.id("brFeeds"), brandColor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.feedId, { brandColor: args.brandColor });
    return null;
  },
});

export const remove = mutation({
  args: { feedId: v.id("brFeeds") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Clean up post states for this feed
    const states = await ctx.db
      .query("brPostState")
      .withIndex("by_feed", (q) => q.eq("feedId", args.feedId))
      .collect();
    for (const state of states) {
      await ctx.db.delete(state._id);
    }
    await ctx.db.delete(args.feedId);
    return null;
  },
});
