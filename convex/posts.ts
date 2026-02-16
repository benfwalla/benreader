import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    feedId: v.optional(v.id("brFeeds")),
    folderId: v.optional(v.id("brFolders")),
    starredOnly: v.optional(v.boolean()),
    historyOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("brPosts"),
      _creationTime: v.number(),
      feedId: v.id("brFeeds"),
      title: v.string(),
      url: v.string(),
      content: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      publishedAt: v.number(),
      isRead: v.boolean(),
      isStarred: v.boolean(),
      isPaywalled: v.boolean(),
      readAt: v.optional(v.number()),
      guid: v.string(),
      author: v.optional(v.string()),
      feedTitle: v.string(),
      feedImageUrl: v.optional(v.string()),
      feedHtmlUrl: v.optional(v.string()),
      feedBrandColor: v.optional(v.string()),
      wordCount: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;

    let posts;

    if (args.historyOnly) {
      posts = await ctx.db
        .query("brPosts")
        .withIndex("by_read", (q) => q.eq("isRead", true))
        .order("desc")
        .take(limit);
    } else if (args.starredOnly) {
      posts = await ctx.db
        .query("brPosts")
        .withIndex("by_starred", (q) => q.eq("isStarred", true))
        .order("desc")
        .take(limit);
    } else if (args.feedId) {
      posts = await ctx.db
        .query("brPosts")
        .withIndex("by_feed", (q) => q.eq("feedId", args.feedId!))
        .order("desc")
        .take(limit);
    } else if (args.folderId) {
      // Query per-feed within the folder
      const feeds = await ctx.db
        .query("brFeeds")
        .withIndex("by_folder", (q) => q.eq("folderId", args.folderId!))
        .collect();
      const allPosts = [];
      for (const feed of feeds) {
        const feedPosts = await ctx.db
          .query("brPosts")
          .withIndex("by_feed", (q) => q.eq("feedId", feed._id))
          .order("desc")
          .take(limit);
        allPosts.push(...feedPosts);
      }
      allPosts.sort((a, b) => b.publishedAt - a.publishedAt);
      posts = allPosts.slice(0, limit);
    } else {
      posts = await ctx.db
        .query("brPosts")
        .withIndex("by_publishedAt")
        .order("desc")
        .take(limit);
    }

    // Attach feed titles
    const feedCache = new Map<string, { title: string; imageUrl?: string; htmlUrl?: string; brandColor?: string }>();
    const result = [];
    for (const post of posts) {
      let feedInfo = feedCache.get(post.feedId);
      if (!feedInfo) {
        const feed = await ctx.db.get(post.feedId);
        feedInfo = { title: feed?.title ?? "Unknown", imageUrl: feed?.imageUrl, htmlUrl: feed?.htmlUrl, brandColor: feed?.brandColor };
        feedCache.set(post.feedId, feedInfo);
      }
      result.push({ ...post, feedTitle: feedInfo.title, feedImageUrl: feedInfo.imageUrl, feedHtmlUrl: feedInfo.htmlUrl, feedBrandColor: feedInfo.brandColor });
    }

    return result;
  },
});

export const markRead = mutation({
  args: { postId: v.id("brPosts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.postId, { isRead: true, readAt: Date.now() });
    return null;
  },
});

export const toggleStar = mutation({
  args: { postId: v.id("brPosts") },
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
    feedId: v.optional(v.id("brFeeds")),
    folderId: v.optional(v.id("brFolders")),
    unread: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const markAsRead = !args.unread;
    let posts;

    if (args.feedId) {
      posts = await ctx.db
        .query("brPosts")
        .withIndex("by_feed", (q) => q.eq("feedId", args.feedId!))
        .collect();
    } else if (args.folderId) {
      const feeds = await ctx.db
        .query("brFeeds")
        .withIndex("by_folder", (q) => q.eq("folderId", args.folderId!))
        .collect();
      const feedIds = new Set(feeds.map((f) => f._id));
      posts = (await ctx.db.query("brPosts").collect()).filter((p) =>
        feedIds.has(p.feedId)
      );
    } else {
      posts = await ctx.db.query("brPosts").collect();
    }

    await Promise.all(
      posts
        .filter((p) => p.isRead !== markAsRead)
        .map((p) => ctx.db.patch(p._id, { isRead: markAsRead, readAt: markAsRead ? Date.now() : undefined }))
    );

    return null;
  },
});
