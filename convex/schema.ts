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

  brPosts: defineTable({
    feedId: v.id("brFeeds"),
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
    wordCount: v.optional(v.number()),
  })
    .index("by_feed", ["feedId", "publishedAt"])
    .index("by_starred", ["isStarred", "publishedAt"])
    .index("by_publishedAt", ["publishedAt"])
    .index("by_guid", ["guid"]),

  brSettings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),
});
