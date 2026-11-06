/**
 * Adding, changing and removing an item's warranties — for the REST routes and the MCP tools alike. Reading them is
 * `listWarranties` in inventory.ts (all of them) or the item's own list.
 */
import type { WarrantyInput, WarrantyPatch } from "@ferret/shared";
import { and, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { attachment, item, warranty } from "../db/schema";
import { type Caller, itemChanged, logActivity, notFound, withStatus } from "./inventory";

const warrantyIn = (v: Caller, id: string) =>
  and(eq(warranty.id, id), eq(warranty.householdId, v.householdId), isNull(warranty.deletedAt));

/** A warranty's source document must be one of the same item's attachments. */
async function requireAttachmentOf(v: Caller, itemId: string, attachmentId: string) {
  const [found] = await v.db
    .select({ id: attachment.id })
    .from(attachment)
    .where(and(eq(attachment.id, attachmentId), eq(attachment.itemId, itemId), eq(attachment.householdId, v.householdId)));
  if (!found) throw new HTTPException(422, { message: "That document isn't attached to this item" });
}

/** An item's warranties, soonest to end first (gone items too: they're reached by id). */
export async function itemWarranties(v: Caller, itemId: string) {
  const rows = await v.db
    .select()
    .from(warranty)
    .where(and(eq(warranty.itemId, itemId), eq(warranty.householdId, v.householdId), isNull(warranty.deletedAt)))
    .orderBy(warranty.endsOn);
  return rows.map(withStatus);
}

export async function createWarranty(v: Caller, itemId: string, input: WarrantyInput) {
  const [owner] = await v.db
    .select({ id: item.id, name: item.name })
    .from(item)
    .where(and(eq(item.id, itemId), eq(item.householdId, v.householdId), isNull(item.deletedAt)));
  if (!owner) throw notFound("Item");
  if (input.attachmentId) await requireAttachmentOf(v, owner.id, input.attachmentId);
  const [row] = await v.db
    .insert(warranty)
    .values({ ...input, householdId: v.householdId, itemId: owner.id })
    .returning();
  await logActivity(v, "warranty.create", row!.id, `Added a warranty to ${owner.name} (until ${row!.endsOn})`, owner.id);
  await itemChanged(v, owner.id);
  return withStatus(row!);
}

export async function updateWarranty(v: Caller, id: string, input: WarrantyPatch) {
  const [current] = await v.db.select().from(warranty).where(warrantyIn(v, id));
  if (!current) throw notFound("Warranty");
  const startsOn = input.startsOn === undefined ? current.startsOn : input.startsOn;
  const endsOn = input.endsOn ?? current.endsOn;
  if (startsOn && startsOn > endsOn) throw new HTTPException(422, { message: "A warranty can't end before it starts" });
  if (input.attachmentId) await requireAttachmentOf(v, current.itemId, input.attachmentId);
  const [row] = await v.db.update(warranty).set(input).where(warrantyIn(v, id)).returning();
  await itemChanged(v, current.itemId);
  return withStatus(row!);
}

/** Soft delete: it goes with the 30-day purge (claims under it stay reachable until then). */
export async function deleteWarranty(v: Caller, id: string) {
  const [row] = await v.db
    .update(warranty)
    .set({ deletedAt: new Date() })
    .where(warrantyIn(v, id))
    .returning({ id: warranty.id, itemId: warranty.itemId });
  if (!row) throw notFound("Warranty");
  await logActivity(v, "warranty.delete", row.id, "Removed a warranty", row.itemId);
  await itemChanged(v, row.itemId);
}
