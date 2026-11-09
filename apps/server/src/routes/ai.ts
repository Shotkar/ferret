/**
 * The AI's helpers (thin; see each lib): what it filled in by itself (lib/ai-fill.ts) — the "Filled in by AI" list,
 * confirming and undoing each; possible duplicates and merging (lib/duplicates.ts).
 */
import { Hono } from "hono";
import { type AppEnv, callerOf, requireHousehold, requireUser, requireWriter } from "../lib/context";
import { aiFillEntries, confirmAiFill, undoAiFill } from "../lib/ai-fill";
import { listDuplicates, mergeItems, notDuplicate } from "../lib/duplicates";
import { mergeInput } from "@ferret/shared";
import { z } from "zod";
import { body } from "../lib/context";

export const ai = new Hono<AppEnv>();
for (const path of ["/ai-fills", "/items/:id/ai-fills/*", "/duplicates", "/duplicates/*", "/items/:id/merge"]) ai.use(path, requireUser, requireHousehold);

/** "Filled in by AI": every field the AI filled in that nobody has looked at yet. */
ai.get("/ai-fills", async (c) => c.json({ data: await aiFillEntries(callerOf(c)) }));
ai.post("/items/:id/ai-fills/:field/confirm", requireWriter, async (c) => c.json(await confirmAiFill(callerOf(c), c.req.param("id"), c.req.param("field"))));
ai.post("/items/:id/ai-fills/:field/undo", requireWriter, async (c) => c.json(await undoAiFill(callerOf(c), c.req.param("id"), c.req.param("field"))));

/** Possible duplicates: pairs that may be the same thing. */
ai.get("/duplicates", async (c) => c.json({ data: await listDuplicates(callerOf(c)) }));
ai.post("/duplicates/not", requireWriter, async (c) => {
  const { a, b } = await body(c.req.raw, z.object({ a: z.string().min(1), b: z.string().min(1) }));
  return c.json(await notDuplicate(callerOf(c), a, b));
});
/** Merge `from` into this one: what it has fills the gaps here, everything pointing at it comes here; it goes to Recently deleted. */
ai.post("/items/:id/merge", requireWriter, async (c) => c.json(await mergeItems(callerOf(c), c.req.param("id"), await body(c.req.raw, mergeInput))));
