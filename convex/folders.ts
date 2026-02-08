import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("brFolders"),
      _creationTime: v.number(),
      name: v.string(),
      order: v.number(),
    })
  ),
  handler: async (ctx) => {
    const folders = await ctx.db.query("brFolders").collect();
    return folders.sort((a, b) => a.order - b.order);
  },
});

export const create = mutation({
  args: { name: v.string(), order: v.optional(v.number()) },
  returns: v.id("brFolders"),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("brFolders").collect();
    const order = args.order ?? existing.length;
    return await ctx.db.insert("brFolders", { name: args.name, order });
  },
});

export const reorder = mutation({
  args: { folderIds: v.array(v.id("brFolders")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await Promise.all(
      args.folderIds.map((id, index) => ctx.db.patch(id, { order: index }))
    );
    return null;
  },
});
