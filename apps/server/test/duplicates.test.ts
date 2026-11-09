import { describe, expect, it } from "vitest";
import { FakeAi, MemoryVectors, photo, setup } from "./helpers";

type Pair = { a: { id: string; name: string }; b: { id: string; name: string }; reasons: string[] };

describe("possible duplicates", () => {
  it("pairs the same serial number, and the same barcode and name", async () => {
    const { user } = await setup();
    const pat = await user("pat");
    const a = await pat.addItem({ name: "Drill", serialNumber: "SN 123-45" });
    const b = await pat.addItem({ name: "Cordless drill", serialNumber: "sn12345" });
    await pat.addItem({ name: "Saw", serialNumber: "OTHER" });
    const c = await pat.addItem({ name: "Batteries", barcode: "0012345678905" });
    const d = await pat.addItem({ name: "batteries", barcode: "0012345678905" });
    const pairs = ((await (await pat.as("/api/v1/duplicates")).json()) as { data: Pair[] }).data;
    expect(pairs.map((p) => [p.a.id, p.b.id].sort())).toEqual(expect.arrayContaining([[a.id, b.id].sort(), [c.id, d.id].sort()]));
    expect(pairs).toHaveLength(2);
    expect(pairs.find((p) => p.reasons.includes("Same serial number"))).toBeTruthy();

    // Not a duplicate: remembered.
    expect((await pat.as("/api/v1/duplicates/not", { method: "POST", body: JSON.stringify({ a: c.id, b: d.id }) })).status).toBe(200);
    expect(((await (await pat.as("/api/v1/duplicates")).json()) as { data: Pair[] }).data).toHaveLength(1);
  });

  it("pairs things that read alike once indexed", async () => {
    const ai = new FakeAi();
    const vectors = new MemoryVectors();
    const { user, jobs } = await setup({ ai, vectors });
    const pat = await user("pat");
    await pat.addItem({ name: "DeWalt drill" });
    await pat.addItem({ name: "Drill driver" });
    await pat.addItem({ name: "KitchenAid mixer" });
    await jobs.drain();
    const pairs = ((await (await pat.as("/api/v1/duplicates")).json()) as { data: Pair[] }).data;
    expect(pairs.map((p) => [p.a.name, p.b.name].sort())).toEqual([["DeWalt drill", "Drill driver"]]);
    expect(pairs[0]!.reasons[0]).toMatch(/^Described alike/);
  });

  it("merges: fields fill gaps, files, warranties, tasks and tags move, and the old link says where it went", async () => {
    const { user } = await setup();
    const pat = await user("pat");
    const keep = await pat.addItem({ name: "Drill", tags: ["tools"] });
    const gone = await pat.addItem({ name: "DeWalt drill", brand: "DeWalt", serialNumber: "X1", tags: ["garage"] });
    await pat.upload(gone.id, await photo(), "drill.jpg");
    await pat.as(`/api/v1/items/${gone.id}/warranties`, { method: "POST", body: JSON.stringify({ endsOn: "2030-01-01" }) });
    await pat.as("/api/v1/maintenance", { method: "POST", body: JSON.stringify({ title: "Oil it", itemId: gone.id, intervalCount: 1, intervalUnit: "year" }) });

    const res = await pat.as(`/api/v1/items/${keep.id}/merge`, { method: "POST", body: JSON.stringify({ from: gone.id, take: ["name"] }) });
    expect(res.status).toBe(200);
    const merged = (await res.json()) as Record<string, unknown>;
    expect(merged).toMatchObject({ id: keep.id, name: "DeWalt drill", brand: "DeWalt", serialNumber: "X1" });
    expect((merged.tags as string[]).sort()).toEqual(["garage", "tools"]);
    expect(await pat.attachments(keep.id)).toHaveLength(1);
    expect(((await (await pat.as(`/api/v1/items/${keep.id}/warranties`)).json()) as { data: unknown[] }).data).toHaveLength(1);
    expect(((await (await pat.as(`/api/v1/maintenance?itemId=${keep.id}`)).json()) as { data: unknown[] }).data).toHaveLength(1);
    const history = ((await (await pat.as(`/api/v1/items/${keep.id}/history`)).json()) as { data: { summary: string }[] }).data.map((h) => h.summary);
    expect(history).toContain("Merged DeWalt drill into DeWalt drill");
    expect(history).toContain("Added DeWalt drill"); // the merged one's history came along

    const old = await pat.as(`/api/v1/items/${gone.id}`);
    expect(old.status).toBe(404);
    expect(((await old.json()) as { error: { details: unknown } }).error.details).toEqual({ mergedIntoId: keep.id });
    // In Recently deleted.
    const trash = ((await (await pat.as("/api/v1/trash/items")).json()) as { data: { id: string }[] }).data;
    expect(trash.map((t) => t.id)).toContain(gone.id);
  });

  it("never merges across households", async () => {
    const { user } = await setup();
    const pat = await user("pat");
    const sam = await user("sam");
    const mine = await pat.addItem({ name: "Drill" });
    const theirs = await sam.addItem({ name: "Drill" });
    expect((await pat.as(`/api/v1/items/${mine.id}/merge`, { method: "POST", body: JSON.stringify({ from: theirs.id }) })).status).toBe(404);
    expect((await pat.as("/api/v1/duplicates/not", { method: "POST", body: JSON.stringify({ a: mine.id, b: theirs.id }) })).status).toBe(404);
  });
});
