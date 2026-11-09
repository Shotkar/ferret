/** Last scanned (lib/sightings.ts): a label or barcode scanned to one thing records when, by whom and how — nothing else. */
import type { ItemListing, Label, ScanResult } from "@ferret/shared";
import { describe, expect, it } from "vitest";
import { member } from "../src/db/schema";
import { setup } from "./helpers";

type User = Awaited<ReturnType<Awaited<ReturnType<typeof setup>>["user"]>>;
const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
const send = (u: User, method: string, url: string, data?: object) => u.as(url, { method, ...(data ? { body: JSON.stringify(data) } : {}) });
const scan = (u: User, code: string, more: object = {}) => json<ScanResult>(send(u, "POST", "/api/v1/scan", { code, ...more }));
const get = (u: User, id: string) => json<ItemListing & { updatedAt: string }>(u.as(`/api/v1/items/${id}`));
const UPC = "036000291452";

describe("last scanned", () => {
  it("is when a barcode, label or pick from \"which one?\" lands on one thing — and changes nothing else about it", async () => {
    const { db, user } = await setup();
    const ann = await user("ann");
    const bob = await user("bob");
    const drill = await ann.addItem({ name: "Drill", barcode: UPC });
    expect((await get(ann, drill.id)).lastScanned).toBeNull();
    const before = (await get(ann, drill.id)).updatedAt;

    expect(await scan(ann, UPC)).toMatchObject({ action: "open" });
    const after = await get(ann, drill.id);
    expect(after.lastScanned).toMatchObject({ by: "ann", how: "barcode" });
    expect(Date.now() - new Date(after.lastScanned!.at).getTime()).toBeLessThan(60_000);
    expect(after.updatedAt).toBe(before);
    expect((await json<{ data: { action: string }[] }>(ann.as(`/api/v1/items/${drill.id}/history`))).data.some((a) => a.action.includes("scan"))).toBe(false);

    // Its QR label, opened by the phone's camera (#/l/:code), by a viewer: theirs now.
    const tag = await json<Label>(send(ann, "POST", "/api/v1/labels/for", { itemId: drill.id }));
    const bobId = (await db.query.user.findFirst({ where: (u, { eq }) => eq(u.name, "bob") }))!.id;
    await db.insert(member).values({ id: crypto.randomUUID(), organizationId: ann.householdId, userId: bobId, role: "viewer", createdAt: new Date() });
    expect(await json(bob.as(`/api/v1/labels/${tag.code}`))).toMatchObject({ item: { id: drill.id } });
    expect((await get(ann, drill.id)).lastScanned).toMatchObject({ by: "bob", how: "label" });

    // A code on two things: nothing until one's picked.
    const spare = await ann.addItem({ name: "Spare drill", barcode: UPC });
    expect(await scan(ann, UPC)).toMatchObject({ action: "choose" });
    expect((await get(ann, spare.id)).lastScanned).toBeNull();
    expect((await get(ann, drill.id)).lastScanned).toMatchObject({ by: "bob" });
    expect(await scan(ann, UPC, { itemId: spare.id })).toMatchObject({ action: "open", item: { id: spare.id } });
    expect((await get(ann, spare.id)).lastScanned).toMatchObject({ by: "ann", how: "barcode" });
  });

  it("finds what hasn't been scanned since a day, and sorts by it", async () => {
    const { user } = await setup();
    const ann = await user("ann");
    await ann.addItem({ name: "Never scanned" });
    const seen = await ann.addItem({ name: "Seen", barcode: UPC });
    await scan(ann, UPC);
    const names = async (q: string) => (await json<{ data: { name: string }[] }>(ann.as(`/api/v1/items?${q}`))).data.map((i) => i.name);
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    expect(await names("notScannedSince=2020-01-01")).toEqual(["Never scanned"]);
    expect((await names(`notScannedSince=${tomorrow}`)).sort()).toEqual(["Never scanned", "Seen"]);
    expect(await names("sort=scanned&dir=desc")).toEqual(["Seen", "Never scanned"]);
    expect((await ann.as("/api/v1/items?notScannedSince=last-year")).status).toBe(422);
    expect(seen.id).toBeTruthy();
  });
});
