import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Article snapshot stored when a post is starred, so stars outlive the RSS window
export const snapshotValidator = v.object({
  title: v.string(),
  url: v.string(),
  publishedAt: v.number(),
  content: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  wordCount: v.optional(v.number()),
  isPaywalled: v.optional(v.boolean()),
  rssContent: v.optional(v.string()),
});

export default defineSchema({
  brFolders: defineTable({
    name: v.string(),
    order: v.number(),
  }),

  brFeeds: defineTable({
    title: v.string(),
    xmlUrl: v.string(),
    htmlUrl: v.string(),
    folderId: v.id("brFolders"),
    imageUrl: v.optional(v.string()),
    brandColor: v.optional(v.string()),
    lastFetchedAt: v.optional(v.number()),
  }).index("by_folder", ["folderId"]),

  brPostState: defineTable({
    guid: v.string(),
    feedId: v.id("brFeeds"),
    isRead: v.boolean(),
    isStarred: v.boolean(),
    readAt: v.optional(v.number()),
    snapshot: v.optional(snapshotValidator),
  })
    .index("by_guid", ["guid"])
    .index("by_feed", ["feedId"])
    .index("by_starred", ["isStarred"]),

  brSettings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),
});
