/**
 * When a thing was last seen (`item_sighting`): for now "scanned" — its QR label opened, or its barcode, label or
 * pairing code scanned in the app to one item (lib/stock.ts `scan`, lib/labels.ts `resolveLabel`). Overwritten each
 * time; not history and not a change to the item (no re-index, no "recently changed", no activity row). Viewers'
 * scans count. Claude's lookup_barcode doesn't: reading out a code isn't seeing the thing.
 */
import type { ItemListing } from "@ferret/shared";
import type { SightingHow, SightingKind } from "@ferret/shared/utils";
import { and, eq } from "drizzle-orm";
import { itemSighting, user } from "../db/schema";
import type { Caller } from "./inventory";
import { inList } from "./sql";

export async function recordSighting(v: Pick<Caller, "db" | "householdId" | "userId">, itemId: string, kind: SightingKind, how: SightingHow) {
  const at = new Date();
  await v.db
    .insert(itemSighting)
    .values({ householdId: v.householdId, itemId, kind, at, userId: v.userId, how })
    .onConflictDoUpdate({ target: [itemSighting.itemId, itemSighting.kind], set: { at, userId: v.userId, how } });
}

/** These items' last scans: when, by whom (their name), how. */
export async function lastScans(v: Pick<Caller, "db" | "householdId">, itemIds: string[]) {
  const rows = itemIds.length
    ? await v.db
        .select({ itemId: itemSighting.itemId, at: itemSighting.at, by: user.name, how: itemSighting.how })
        .from(itemSighting)
        .leftJoin(user, eq(user.id, itemSighting.userId))
        .where(and(eq(itemSighting.householdId, v.householdId), eq(itemSighting.kind, "scanned"), inList(itemSighting.itemId, itemIds)))
    : [];
  return new Map<string, NonNullable<ItemListing["lastScanned"]>>(rows.map((r) => [r.itemId, { at: r.at.toISOString(), by: r.by ?? null, how: r.how }]));
}
