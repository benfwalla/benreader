import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    feedId: v.optional(v.id("feeds")),
    folderId: v.optional(v.id("folders")),
    starredOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("posts"),
      _creationTime: v.number(),
      feedId: v.id("feeds"),
      title: v.string(),
      url: v.string(),
      content: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      publishedAt: v.number(),
      isRead: v.boolean(),
      isStarred: v.boolean(),
      isPaywalled: v.boolean(),
      guid: v.string(),
      author: v.optional(v.string()),
      feedTitle: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    let posts;

    if (args.starredOnly) {
      posts = await ctx.db
        .query("posts")
        .withIndex("by_starred", (q) => q.eq("isStarred", true))
        .order("desc")
        .take(limit);
    } else if (args.feedId) {
      posts = await ctx.db
        .query("posts")
        .withIndex("by_feed", (q) => q.eq("feedId", args.feedId!))
        .order("desc")
        .take(limit);
    } else {
      posts = await ctx.db
        .query("posts")
        .withIndex("by_publishedAt")
        .order("desc")
        .take(limit);
    }

    // If filtering by folder, get feeds in that folder first
    if (args.folderId && !args.feedId && !args.starredOnly) {
      const feeds = await ctx.db
        .query("feeds")
        .withIndex("by_folder", (q) => q.eq("folderId", args.folderId!))
        .collect();
      const feedIds = new Set(feeds.map((f) => f._id));
      posts = posts.filter((p) => feedIds.has(p.feedId));
    }

    // Attach feed titles
    const feedCache = new Map<string, string>();
    const result = [];
    for (const post of posts) {
      let feedTitle = feedCache.get(post.feedId);
      if (!feedTitle) {
        const feed = await ctx.db.get(post.feedId);
        feedTitle = feed?.title ?? "Unknown";
        feedCache.set(post.feedId, feedTitle);
      }
      result.push({ ...post, feedTitle });
    }

    return result;
  },
});

export const markRead = mutation({
  args: { postId: v.id("posts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.postId, { isRead: true });
    return null;
  },
});

export const toggleStar = mutation({
  args: { postId: v.id("posts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (post) {
      await ctx.db.patch(args.postId, { isStarred: !post.isStarred });
    }
    return null;
  },
});

export const markAllRead = mutation({
  args: {
    feedId: v.optional(v.id("feeds")),
    folderId: v.optional(v.id("folders")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let posts;

    if (args.feedId) {
      posts = await ctx.db
        .query("posts")
        .withIndex("by_feed", (q) => q.eq("feedId", args.feedId!))
        .collect();
    } else if (args.folderId) {
      const feeds = await ctx.db
        .query("feeds")
        .withIndex("by_folder", (q) => q.eq("folderId", args.folderId!))
        .collect();
      const feedIds = new Set(feeds.map((f) => f._id));
      posts = (await ctx.db.query("posts").collect()).filter((p) =>
        feedIds.has(p.feedId)
      );
    } else {
      posts = await ctx.db.query("posts").collect();
    }

    await Promise.all(
      posts
        .filter((p) => !p.isRead)
        .map((p) => ctx.db.patch(p._id, { isRead: true }))
    );

    return null;
  },
});
