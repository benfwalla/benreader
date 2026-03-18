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

export const updateImage = mutation({
  args: { feedId: v.id("brFeeds"), imageUrl: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.feedId, { imageUrl: args.imageUrl });
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
