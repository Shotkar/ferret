import { describe, expect, it } from "vitest";
import { attachment } from "../src/db/schema";
import { askInventory, askOutputTokens, estimateAskTokens } from "../src/lib/ask";
import { refreshFullText } from "../src/lib/fulltext";
import type { Db } from "../src/ports";
import { FakeAi, setup } from "./helpers";

// These canned replies exercise evidence selection, isolation and citations.
// They do not establish that a real model follows or faithfully summarizes a manual.
async function seedDocument(db: Db, householdId: string, itemId: string, filename: string, text: string, description = "Synthetic test manual") {
  const id = crypto.randomUUID();
  await db.insert(attachment).values({
    id, householdId, itemId, kind: "document", filename, contentType: "application/pdf",
    size: text.length, blobKey: `synthetic-only-${id}`, analysisStatus: "done",
    analysis: { description, text, suggestions: {} },
  });
  return id;
}

describe("Ask source isolation and selection", () => {
  it("excludes foreign attachment descriptions and text even with an inconsistent owned-item link", async () => {
    const ai = new FakeAi([{ answer: "1. Follow PUBLIC_ROUTINE_TOKEN.\n2. Store the fictional fixture.", found: true, sources: [2] }]);
    const env = await setup({ ai });
    const pat = await env.user("pat");
    const sam = await env.user("sam");
    const fixture = await pat.addItem({ name: "Owned demonstration fixture" });
    const ownId = await seedDocument(env.db, pat.householdId, fixture.id, "public-test-manual.pdf",
      "## Cleaning\n1. Clean the fixture using PUBLIC_ROUTINE_TOKEN.\n2. Store the fictional fixture.");
    // The item foreign key alone permits this inconsistent link; both summary
    // construction and document selection must still enforce household ownership.
    const foreignId = await seedDocument(env.db, sam.householdId, fixture.id, "foreign-test-manual.pdf",
      "## Cleaning\n1. PRIVATE_TEXT_CANARY.\n2. Keep PRIVATE_TEXT_CANARY secret.", "PRIVATE_DESCRIPTION_CANARY");

    const answer = await askInventory({ db: env.db, model: ai, timeZone: "Pacific/Auckland" }, pat.householdId,
      "How do I clean the fixture?", {
        data: [{ id: fixture.id, name: "Owned demonstration fixture" }],
        hits: { [fixture.id]: { via: "words", attachmentId: foreignId, snippet: "PRIVATE_SNIPPET_CANARY" } },
      });

    expect(ai.calls).toHaveLength(1);
    const prompt = ai.calls[0]!.prompt;
    expect(prompt).toContain("PUBLIC_ROUTINE_TOKEN");
    expect(prompt).not.toContain("PRIVATE_DESCRIPTION_CANARY");
    expect(prompt).not.toContain("PRIVATE_TEXT_CANARY");
    expect(prompt).not.toContain("PRIVATE_SNIPPET_CANARY");
    expect(prompt).not.toContain("foreign-test-manual.pdf");
    expect(answer.found).toBe(true);
    expect(answer.citations).toEqual([expect.objectContaining({ itemId: fixture.id, attachmentId: ownId, filename: "public-test-manual.pdf" })]);
  });

  it("keeps manuals for two owned items that share the same requested cleaning operation", async () => {
    const ai = new FakeAi([{
      answer: "1. Clean fixture A using SYNTHETIC_A_CLEAN.\n2. Store fixture A.\n3. Clean fixture B using SYNTHETIC_B_CLEAN.\n4. Store fixture B.",
      found: true, sources: [2, 4],
    }]);
    const env = await setup({ ai });
    const pat = await env.user("pat");
    const first = await pat.addItem({ name: "Demonstration fixture A" });
    const second = await pat.addItem({ name: "Demonstration fixture B" });
    const firstId = await seedDocument(env.db, pat.householdId, first.id, "fixture-a.pdf",
      "## Cleaning\n1. Clean the fixture using SYNTHETIC_A_CLEAN.\n2. Store the fixture after testing.");
    const secondId = await seedDocument(env.db, pat.householdId, second.id, "fixture-b.pdf",
      "## Cleaning\n1. Clean the fixture using SYNTHETIC_B_CLEAN.\n2. Store the fixture after testing.");

    const answer = await askInventory({ db: env.db, model: ai, timeZone: "Pacific/Auckland" }, pat.householdId,
      "How do I clean both fixtures?", {
        data: [{ id: first.id, name: "Demonstration fixture A" }, { id: second.id, name: "Demonstration fixture B" }], hits: {},
      });

    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]!.prompt).toContain("SYNTHETIC_A_CLEAN");
    expect(ai.calls[0]!.prompt).toContain("SYNTHETIC_B_CLEAN");
    expect(answer.found).toBe(true);
    expect(answer.citations).toEqual([
      expect.objectContaining({ itemId: first.id, attachmentId: firstId }),
      expect.objectContaining({ itemId: second.id, attachmentId: secondId }),
    ]);
  });

  it("budgets the later authoritative procedure before an early weak troubleshooting attachment", async () => {
    const ai = new FakeAi([{ answer: "1. Perform SYNTHETIC_AUTHORITATIVE_START.\n2. Perform SYNTHETIC_AUTHORITATIVE_FINISH.", found: true, sources: [2] }]);
    const env = await setup({ ai });
    const pat = await env.user("pat");
    const fixture = await pat.addItem({ name: "Descaling demonstration fixture" });
    const weakId = await seedDocument(env.db, pat.householdId, fixture.id, "early-troubleshooting.pdf",
      `## Troubleshooting\nFor descaling, consult the separate original procedure. ${"WEAK_DIAGNOSTIC_BODY: generic diagnostic background. ".repeat(130)}`,
      "Long troubleshooting reference");
    const instructions = `## 11. Descaling\n1. Descale the fixture using SYNTHETIC_AUTHORITATIVE_START. ${"Preserve the fictional marked component in its documented position. ".repeat(5)}\n2. Perform SYNTHETIC_AUTHORITATIVE_FINISH. ${"Restore the fictional test fixture as described here. ".repeat(5)}`;
    const authoritativeId = await seedDocument(env.db, pat.householdId, fixture.id, "later-authoritative-manual.pdf",
      `${"Unrelated background information about the fictional fixture.\n".repeat(800)}\n${instructions}`,
      "Authoritative synthetic manufacturer procedure");
    const question = "How do I descale this fixture?";

    const answer = await askInventory({ db: env.db, model: ai, timeZone: "Pacific/Auckland", contextTokens: 2048 }, pat.householdId,
      question, {
        data: [{ id: fixture.id, name: "Descaling demonstration fixture" }],
        hits: { [fixture.id]: { via: "words", attachmentId: weakId, snippet: "For descaling, consult the separate original procedure." } },
      });

    expect(ai.calls).toHaveLength(1);
    const prompt = ai.calls[0]!.prompt;
    expect(prompt).toContain(JSON.stringify({ text: instructions }));
    expect(prompt).not.toContain("WEAK_DIAGNOSTIC_BODY");
    expect(prompt).not.toContain("early-troubleshooting.pdf");
    const estimatedTotal = estimateAskTokens(prompt) + askOutputTokens(question, 2048) + 256;
    expect(estimatedTotal).toBeLessThanOrEqual(2048);
    expect(answer.found).toBe(true);
    expect(answer.citations).toEqual([expect.objectContaining({ itemId: fixture.id, attachmentId: authoritativeId, filename: "later-authoritative-manual.pdf", sections: ["11. Descaling"] })]);
  });

  it("discovers descaling through a related phrase with keyword-only search while preserving the original question", async () => {
    const ai = new FakeAi([{ answer: "1. Perform SYNTHETIC_SYNONYM_START.\n2. Perform SYNTHETIC_SYNONYM_FINISH.", found: true, sources: [2] }]);
    // No vector store is configured: item discovery must work through FTS alone.
    const env = await setup({ ai });
    const pat = await env.user("pat");
    const fixture = await pat.addItem({ name: "Demonstration fixture" });
    const documentId = await seedDocument(env.db, pat.householdId, fixture.id, "synthetic-synonym-manual.pdf",
      "## Descaling\n1. Perform SYNTHETIC_SYNONYM_START.\n2. Perform SYNTHETIC_SYNONYM_FINISH.");
    await refreshFullText(env.db, fixture.id);
    const question = "How do I remove scale?";

    const response = await pat.as("/api/v1/ask", { method: "POST", body: JSON.stringify({ question }) });
    const answer = await response.json() as { found: boolean; citations: { attachmentId?: string }[] };

    expect(response.status).toBe(200);
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]!.prompt).toContain(`Question: ${question}`);
    expect(ai.calls[0]!.prompt).toContain("SYNTHETIC_SYNONYM_FINISH");
    expect(answer.found).toBe(true);
    expect(answer.citations).toEqual([expect.objectContaining({ attachmentId: documentId })]);
  });
});
