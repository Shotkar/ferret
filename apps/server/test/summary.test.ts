/** GET /api/v1/summary — a household at a glance for home dashboards: counts and the total, with a read-only key. */
import { describe, expect, it } from "vitest";
import { setup } from "./helpers";

describe("summary for dashboards", () => {
  it("counts things, their value, the bell and the shopping list — and works with a read-only key", async () => {
    const { user } = await setup();
    const ann = await user("ann");
    await ann.addItem({ name: "Drill", valueCents: 8000 });
    await ann.addItem({ name: "Batteries", purchasePriceCents: 500, quantity: 4, minQuantity: 6 });
    await ann.addItem({ name: "Mystery box" });
    const bob = await user("bob");
    await bob.addItem({ name: "Bob's own", valueCents: 100_000 });

    const made = await ann.as("/api/v1/api-keys", { method: "POST", body: JSON.stringify({ name: "Heimdall", readOnly: true }) });
    const { key } = (await made.json()) as { key: string };
    const res = await ann.as("/api/v1/summary", { headers: { Cookie: "", "X-Api-Key": key } });
    expect(res.status).toBe(200);
    const summary = (await res.json()) as Record<string, unknown>;
    expect(summary).toEqual({ household: "ann home", things: 3, valueCents: 10_000, needsAttention: expect.any(Number), urgent: expect.any(Number), toBuy: 1 });
    // Counts only: nothing about what the things are.
    expect(JSON.stringify(summary)).not.toMatch(/Drill|Batteries/);

    expect((await ann.as("/api/v1/summary", { headers: { Cookie: "" } })).status).toBe(401);
  });
});
