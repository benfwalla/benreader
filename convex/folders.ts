import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("folders"),
      _creationTime: v.number(),
      name: v.string(),
      order: v.number(),
    })
  ),
  handler: async (ctx) => {
    const folders = await ctx.db.query("folders").collect();
    return folders.sort((a, b) => a.order - b.order);
  },
});

export const create = mutation({
  args: { name: v.string(), order: v.optional(v.number()) },
  returns: v.id("folders"),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("folders").collect();
    const order = args.order ?? existing.length;
    return await ctx.db.insert("folders", { name: args.name, order });
  },
});

export const reorder = mutation({
  args: { folderIds: v.array(v.id("folders")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await Promise.all(
      args.folderIds.map((id, index) => ctx.db.patch(id, { order: index }))
    );
    return null;
  },
});
