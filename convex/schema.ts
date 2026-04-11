import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
  })
    .index("by_guid", ["guid"])
    .index("by_feed", ["feedId"])
    .index("by_starred", ["isStarred"]),

  brSettings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),
});
