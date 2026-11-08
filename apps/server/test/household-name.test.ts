/** Renaming a household (Settings → Household): owners and admins, the name only. */
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { HOUSEHOLD_NAME_MAX } from "../src/auth";
import { member } from "../src/db/schema";
import { setup } from "./helpers";

const post = (body: object) => ({ method: "POST", body: JSON.stringify(body) });

describe("a household's name", () => {
  it("can be changed by its owners and admins, and nothing else about it", async () => {
    const { user, db } = await setup();
    const ann = await user("ann");
    const bob = await user("bob");
    const nameOf = async () => (await db.query.organization.findFirst({ where: (o, { eq }) => eq(o.id, ann.householdId) }))!;
    const before = await nameOf();

    const renamed = await ann.as("/api/auth/organization/update", post({ organizationId: ann.householdId, data: { name: "  The Highland House " } }));
    expect(renamed.status).toBe(200);
    expect((await nameOf()).name).toBe("The Highland House");

    // Only the name: not the slug, logo or metadata, and not blank or too long.
    for (const data of [{ name: "X", slug: "taken" }, { logo: "https://example.com/x.png" }, { metadata: { a: 1 } }, { name: "   " }, { name: "x".repeat(HOUSEHOLD_NAME_MAX + 1) }]) {
      expect((await ann.as("/api/auth/organization/update", post({ organizationId: ann.householdId, data }))).status).toBe(400);
    }
    expect(await nameOf()).toMatchObject({ name: "The Highland House", slug: before.slug, logo: before.logo, metadata: before.metadata });

    // A member can't; an admin can.
    const bobId = (await db.query.user.findFirst({ where: (u, { eq }) => eq(u.name, "bob") }))!.id;
    await db.insert(member).values({ id: crypto.randomUUID(), organizationId: ann.householdId, userId: bobId, role: "member", createdAt: new Date() });
    expect((await bob.as("/api/auth/organization/update", post({ organizationId: ann.householdId, data: { name: "Bob's now" } }))).status).toBe(403);
    expect((await nameOf()).name).toBe("The Highland House");

    await db.update(member).set({ role: "admin" }).where(and(eq(member.organizationId, ann.householdId), eq(member.userId, bobId)));
    expect((await bob.as("/api/auth/organization/update", post({ organizationId: ann.householdId, data: { name: "Highland" } }))).status).toBe(200);
    expect((await nameOf()).name).toBe("Highland");
  });
});
