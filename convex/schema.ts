import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// NOTE: This deployment is shared with bonbon + fitclaw - include ALL schemas
export default defineSchema({
  // ========== BONBON TABLES (DO NOT MODIFY) ==========
  recipes: defineTable({
    url: v.string(),
    videoId: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    ownerComment: v.optional(v.string()),
    thumbnail: v.optional(v.string()),
    channelName: v.optional(v.string()),
    channelId: v.optional(v.string()),
    duration: v.optional(v.string()),
    transcript: v.optional(v.string()),
    aiRecipe: v.optional(v.object({
      title: v.optional(v.string()),
      cleanTitle: v.optional(v.string()),
      description: v.optional(v.string()),
      prepTime: v.optional(v.string()),
      cookTime: v.optional(v.string()),
      servings: v.optional(v.string()),
      ingredients: v.array(v.string()),
      instructions: v.array(v.string()),
    })),
    chatHistory: v.optional(v.array(v.object({
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
    }))),
    aiRecipeStatus: v.optional(v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("done"),
      v.literal("failed")
    )),
    aiRecipeError: v.optional(v.string()),
  }).index("by_videoId", ["videoId"]),

  // ========== FITCLAW TABLES (DO NOT MODIFY) ==========
  fitUser: defineTable({
    name: v.optional(v.string()),
    goals: v.optional(v.array(v.string())),
    experienceLevel: v.optional(v.string()),
    preferredDuration: v.optional(v.number()),
    notes: v.optional(v.string()),
  }),

  fitEquipment: defineTable({
    name: v.string(),
    category: v.string(),
    available: v.boolean(),
    notes: v.optional(v.string()),
  }).index("by_category", ["category"]),

  fitExercises: defineTable({
    name: v.string(),
    muscleGroups: v.array(v.string()),
    equipment: v.array(v.string()),
    difficulty: v.string(),
    instructions: v.optional(v.string()),
    isCompound: v.boolean(),
  }).index("by_muscle", ["muscleGroups"]),

  fitWorkouts: defineTable({
    date: v.string(),
    name: v.optional(v.string()),
    duration: v.optional(v.number()),
    notes: v.optional(v.string()),
    exercises: v.array(v.object({
      name: v.string(),
      muscleGroups: v.array(v.string()),
      sets: v.array(v.object({
        reps: v.number(),
        weight: v.optional(v.number()),
        notes: v.optional(v.string()),
      })),
    })),
  }).index("by_date", ["date"]),

  fitChat: defineTable({
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    timestamp: v.number(),
    workoutId: v.optional(v.id("fitWorkouts")),
  }).index("by_timestamp", ["timestamp"]),

  fitCurrentWorkout: defineTable({
    startedAt: v.number(),
    exercises: v.array(v.object({
      name: v.string(),
      muscleGroups: v.array(v.string()),
      targetSets: v.number(),
      targetReps: v.string(),
      suggestedWeight: v.optional(v.number()),
      completedSets: v.array(v.object({
        reps: v.number(),
        weight: v.optional(v.number()),
        notes: v.optional(v.string()),
      })),
    })),
    notes: v.optional(v.string()),
  }),

  // ========== BENREADER TABLES ==========
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
