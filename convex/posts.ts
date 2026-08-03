import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { snapshotValidator } from "./schema";

// List post states — used by frontend to merge with client-fetched RSS data.
// Snapshot payloads are stripped; the starred view loads them separately.
export const listStates = query({
  args: {},
  handler: async (ctx) => {
    const states = await ctx.db.query("brPostState").collect();
    return states.map((s) => ({
      guid: s.guid,
      feedId: s.feedId,
      isRead: s.isRead,
      isStarred: s.isStarred,
      readAt: s.readAt,
      hasSnapshot: s.snapshot !== undefined,
    }));
  },
});

// Snapshots of starred posts — keeps stars visible after they age out of the RSS window
export const listStarredSnapshots = query({
  args: {},
  handler: async (ctx) => {
    const starred = await ctx.db
      .query("brPostState")
      .withIndex("by_starred", (q) => q.eq("isStarred", true))
      .collect();
    return starred
      .filter((s) => s.snapshot)
      .map((s) => ({ guid: s.guid, feedId: s.feedId, snapshot: s.snapshot! }));
  },
});

// Attach a snapshot to an already-starred post that predates snapshotting
export const saveSnapshot = mutation({
  args: { guid: v.string(), snapshot: snapshotValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("brPostState")
      .withIndex("by_guid", (q) => q.eq("guid", args.guid))
      .first();
    if (existing && existing.isStarred && !existing.snapshot) {
      await ctx.db.patch(existing._id, { snapshot: args.snapshot });
    }
    return null;
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
  args: { guid: v.string(), feedId: v.id("brFeeds"), snapshot: v.optional(snapshotValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("brPostState")
      .withIndex("by_guid", (q) => q.eq("guid", args.guid))
      .first();
    if (existing) {
      const starring = !existing.isStarred;
      await ctx.db.patch(existing._id, {
        isStarred: starring,
        snapshot: starring ? args.snapshot : undefined,
      });
    } else {
      await ctx.db.insert("brPostState", {
        guid: args.guid,
        feedId: args.feedId,
        isRead: false,
        isStarred: true,
        snapshot: args.snapshot,
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
