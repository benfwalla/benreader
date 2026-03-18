import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// List post states — used by frontend to merge with client-fetched RSS data
export const listStates = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("brPostState").collect();
  },
});

// Get states for starred posts only
export const listStarred = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("brPostState")
      .withIndex("by_starred", (q) => q.eq("isStarred", true))
      .collect();
  },
});

// Get states for read posts (history)
export const listHistory = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    const all = await ctx.db.query("brPostState").collect();
    return all
      .filter((s) => s.isRead)
      .sort((a, b) => (b.readAt ?? 0) - (a.readAt ?? 0))
      .slice(0, limit);
  },
});

export const markRead = mutation({
  args: { guid: v.string(), feedId: v.id("brFeeds") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("brPostState")
      .withIndex("by_guid", (q) => q.eq("guid", args.guid))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { isRead: true, readAt: Date.now() });
    } else {
      await ctx.db.insert("brPostState", {
        guid: args.guid,
        feedId: args.feedId,
        isRead: true,
        isStarred: false,
        readAt: Date.now(),
      });
    }
    return null;
  },
});

export const toggleStar = mutation({
  args: { guid: v.string(), feedId: v.id("brFeeds") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("brPostState")
      .withIndex("by_guid", (q) => q.eq("guid", args.guid))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { isStarred: !existing.isStarred });
    } else {
      await ctx.db.insert("brPostState", {
        guid: args.guid,
        feedId: args.feedId,
        isRead: false,
        isStarred: true,
      });
    }
    return null;
  },
});

export const markAllRead = mutation({
  args: {
    guids: v.optional(v.array(v.string())),
    feedId: v.optional(v.id("brFeeds")),
    folderId: v.optional(v.id("brFolders")),
    unread: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const markAsRead = !args.unread;
    let states;

    if (args.feedId) {
      states = await ctx.db
        .query("brPostState")
        .withIndex("by_feed", (q) => q.eq("feedId", args.feedId!))
        .collect();
    } else if (args.folderId) {
      const feeds = await ctx.db
        .query("brFeeds")
        .withIndex("by_folder", (q) => q.eq("folderId", args.folderId!))
        .collect();
      const feedIds = new Set(feeds.map((f) => f._id));
      states = (await ctx.db.query("brPostState").collect()).filter((s) =>
        feedIds.has(s.feedId)
      );
    } else {
      states = await ctx.db.query("brPostState").collect();
    }

    // If guids provided, also create states for posts not yet in DB
    if (args.guids && args.feedId && markAsRead) {
      const existingGuids = new Set(states.map((s) => s.guid));
      for (const guid of args.guids) {
        if (!existingGuids.has(guid)) {
          await ctx.db.insert("brPostState", {
            guid,
            feedId: args.feedId,
            isRead: true,
            isStarred: false,
            readAt: Date.now(),
          });
        }
      }
    }

    await Promise.all(
      states
        .filter((s) => s.isRead !== markAsRead)
        .map((s) =>
          ctx.db.patch(s._id, {
            isRead: markAsRead,
            readAt: markAsRead ? Date.now() : undefined,
          })
        )
    );

    return null;
  },
});
