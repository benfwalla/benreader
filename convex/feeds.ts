import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("feeds").collect();
  },
});

export const get = query({
  args: { feedId: v.id("feeds") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.feedId);
  },
});

export const add = mutation({
  args: {
    title: v.string(),
    xmlUrl: v.string(),
    htmlUrl: v.string(),
    folderId: v.id("folders"),
  },
  returns: v.id("feeds"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("feeds", {
      title: args.title,
      xmlUrl: args.xmlUrl,
      htmlUrl: args.htmlUrl,
      folderId: args.folderId,
    });
  },
});

export const remove = mutation({
  args: { feedId: v.id("feeds") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_feed", (q) => q.eq("feedId", args.feedId))
      .collect();
    for (const post of posts) {
      await ctx.db.delete(post._id);
    }
    await ctx.db.delete(args.feedId);
    return null;
  },
});

export const upsertPosts = internalMutation({
  args: {
    feedId: v.id("feeds"),
    posts: v.array(
      v.object({
        title: v.string(),
        url: v.string(),
        content: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
        publishedAt: v.number(),
        guid: v.string(),
        author: v.optional(v.string()),
        isPaywalled: v.boolean(),
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const post of args.posts) {
      const existing = await ctx.db
        .query("posts")
        .withIndex("by_guid", (q) => q.eq("guid", post.guid))
        .first();

      if (!existing) {
        await ctx.db.insert("posts", {
          feedId: args.feedId,
          title: post.title,
          url: post.url,
          content: post.content,
          imageUrl: post.imageUrl,
          publishedAt: post.publishedAt,
          isRead: false,
          isStarred: false,
          isPaywalled: post.isPaywalled,
          guid: post.guid,
          author: post.author,
        });
      }
    }

    await ctx.db.patch(args.feedId, { lastFetchedAt: Date.now() });
    return null;
  },
});
