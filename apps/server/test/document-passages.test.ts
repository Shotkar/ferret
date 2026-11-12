import { describe, expect, it } from "vitest";
import { formatDocumentPassage, relevantQueryTerms, selectDocumentPassages } from "../src/lib/document-passages";

// Entirely synthetic instructions: these are retrieval fixtures, not appliance advice.
const procedure = Array.from({ length: 12 }, (_, i) => `${i + 1}. Perform synthetic operation ${i + 1} using marker ${String.fromCharCode(65 + i)}.`).join("\n");
const preamble = "General information about this demonstration appliance.\n".repeat(1100);
const manual = `${preamble}
## 10. Troubleshooting
| Symptom | Reference |
| Scale reported | See section 11 for descaling. |
## 11. DESCALING
## Please note
Warning: use only the fictional test material. Check the original illustration for the missing button symbol ( ).
${procedure}
## Rinsing
Complete the synthetic rinse and remove the test containers.
## Important
Keep this final safety note with the procedure.
## 12. Indicator meanings
Unrelated descriptions of lights.`;

describe("document passages", () => {
  it("retrieves a late complete procedure with same-level safety notes and rinse instructions", () => {
    const [passage] = selectDocumentPassages(manual, "How do I descale my coffee machine?");
    expect(passage).toMatchObject({ heading: "11. DESCALING", complete: true, truncated: false });
    expect(passage!.text).toContain(procedure);
    expect(passage!.text).toContain("missing button symbol ( )");
    expect(passage!.text).toContain("final safety note");
    expect(passage!.text).toContain("synthetic rinse");
    expect(passage!.text).not.toContain("10. Troubleshooting");
    expect(passage!.text).not.toContain("12. Indicator meanings");
    expect(manual.slice(passage!.start, passage!.end)).toBe(passage!.text);
  });

  it("prefers a substantive procedure over product-name headings and a contents entry", () => {
    const text = `## Coffee machine\nCoffee machine description. ${"General information. ".repeat(20)}\n## Descaling\nSee section 11.\n${manual}`;
    const [passage] = selectDocumentPassages(text, "How do I descale my coffee machine?");
    expect(passage!.heading).toBe("11. DESCALING");
    expect(passage!.text).toContain("12. Perform synthetic operation 12");
  });

  it.each(["How do I descale?", "Show descaling instructions", "How do I remove scale?", "What is the scale removal procedure?"])("matches related operation wording: %s", (question) => {
    expect(selectDocumentPassages(manual, question)[0]!.heading).toBe("11. DESCALING");
  });

  it("keeps numbered child sections while excluding the next numbered sibling", () => {
    const text = "## 8. Maintenance\nGeneral overview.\n## 8.3 Cleaning the burr\nRemove the demonstration component.\n## Please note\nUse a test brush.\n## 8.3.1 Reassembly\nRestore the fixture.\n## 8.4 Cleaning the tray\nEmpty the tray.\n## 9. Storage\nStore away.";
    const [passage] = selectDocumentPassages(text, "How do I clean the burr?", { wholeDocumentChars: 0 });
    expect(passage!.heading).toBe("8.3 Cleaning the burr");
    expect(passage!.text).toContain("Use a test brush.");
    expect(passage!.text).toContain("8.3.1 Reassembly");
    expect(passage!.text).not.toContain("8.4 Cleaning the tray");
  });

  it("carries original parent-introduction safety text with a child procedure and excludes siblings", () => {
    const text = "## 8. Maintenance\n## Warning\nDisconnect the fictional fixture before cleaning.\nPreparation: place the synthetic safety collar.\n## 8.1 Cleaning the tray\nUnrelated tray instructions.\n## 8.2 Cleaning the wand\n1. Remove the test wand.\n2. Restore the wand safely.\n## 9. Storage\nUnrelated storage advice.";
    const passages = selectDocumentPassages(text, "How do I clean the wand?", { wholeDocumentChars: 0 });
    expect(passages.map((p) => p.heading)).toEqual(["8. Maintenance", "8.2 Cleaning the wand"]);
    expect(passages[0]!.text).toContain("Disconnect the fictional fixture");
    expect(passages[0]!.text).toContain("synthetic safety collar");
    expect(passages[1]!.text).toContain("2. Restore the wand safely.");
    expect(passages.every((p) => p.complete)).toBe(true);
    expect(passages.map((p) => p.text).join("\n")).not.toContain("Unrelated tray");
    for (const passage of passages) expect(text.slice(passage.start, passage.end)).toBe(passage.text);
  });

  it("marks child context incomplete when an inherited safety warning cannot fit", () => {
    const text = `## Maintenance\nWarning: ${"Preserve this fictional safety instruction. ".repeat(15)}\n### Cleaning the wand\n1. Remove the test wand.\n2. Restore the wand safely.`;
    for (const limits of [{ maxPassages: 1 }, { maxChars: 150 }]) {
      const [passage] = selectDocumentPassages(text, "How do I clean the wand?", { wholeDocumentChars: 0, ...limits });
      expect(passage).toMatchObject({ heading: "Cleaning the wand", complete: false, truncated: true, omittedSafety: true });
      expect(formatDocumentPassage(passage!)).toContain("omitted required safety or preparation text from the parent section");
      expect(passage!.text).toContain("2. Restore the wand safely.");
    }
  });

  it("retrieves preparation and cycle sections for the same operation", () => {
    const text = "## Descaling preparation\n1. Put on the fictional safety collar.\n2. Prepare both test containers.\n## Descaling cycle\n1. Start the fictional demonstration cycle.\n2. Finish the demonstration cycle.\n3. Complete the synthetic inspection.";
    const passages = selectDocumentPassages(text, "How do I descale my coffee machine?", { wholeDocumentChars: 0 });
    expect(passages.map((p) => p.heading)).toEqual(["Descaling preparation", "Descaling cycle"]);
    expect(passages.every((p) => p.complete)).toBe(true);
    expect(passages.map((p) => p.text).join("\n")).toContain("Finish the demonstration cycle");
    const limited = selectDocumentPassages(text, "How do I descale?", { maxPassages: 1, wholeDocumentChars: 0 });
    expect(limited[0]).toMatchObject({ complete: false, omittedPassages: true });
    expect(formatDocumentPassage(limited[0]!)).toContain("omitted additional relevant source passages");
  });

  it("keeps a safety paragraph before the first heading without copying unrelated preamble", () => {
    const text = `General information unrelated to this procedure.\n\nWarning: unplug the fictional fixture before descaling.\n\n## Descaling\n1. Start the fictional test.\n2. Finish the fictional test.`;
    const passages = selectDocumentPassages(text, "How do I descale?", { wholeDocumentChars: 0 });
    expect(passages).toHaveLength(2);
    expect(passages[0]!.text).toBe("Warning: unplug the fictional fixture before descaling.");
    expect(passages[1]!.text).toContain("2. Finish the fictional test.");
    expect(passages.every((p) => p.complete)).toBe(true);
    expect(passages.map((p) => p.text).join("\n")).not.toContain("General information");
  });

  it("exposes normalized topic coverage for cross-document budgeting", () => {
    expect(relevantQueryTerms("DESCALING the wand", "How do I remove scale and clean the wand and filter?")).toEqual(["descal", "wand"]);
  });

  it("retrieves distinct requested cleaning topics without adding another unrelated cleaning section", () => {
    const text = "## Cleaning the wand\nClean the fictional wand after testing.\n## Cleaning the filter\nClean the fictional filter before storage.\n## Cleaning the tray\nClean the unrelated tray.";
    const passages = selectDocumentPassages(text, "How do I clean the wand and filter?", { wholeDocumentChars: 0 });
    expect(passages.map((p) => p.heading)).toEqual(["Cleaning the wand", "Cleaning the filter"]);
    expect(passages.map((p) => p.text).join("\n")).not.toContain("unrelated tray");
  });

  it("does not retrieve descaling for an unrelated attribute question", () => {
    expect(selectDocumentPassages(manual, "What colour is the power cable?")).toEqual([]);
  });

  it("preserves small receipt text whole", () => {
    const text = "Test shop\nReceipt 123\nPurchased 2026-10-01\nFictional widget: NZD 42.50";
    const [passage] = selectDocumentPassages(text, "Where did I buy the widget?");
    expect(passage!.text).toBe(text);
    expect(passage!.complete).toBe(true);
  });

  it("groups headingless numbered instructions and warnings across paragraphs", () => {
    const text = `${preamble}\n\nDescaling the demonstration fixture.\n\nWarning: retain the test safety note.\n\n${procedure.replaceAll("\n", "\n\n")}\n\nNote: finish with the synthetic rinse.\n\nOther information about storage.`;
    const [passage] = selectDocumentPassages(text, "How do I descale?");
    expect(passage!.text).toContain("Descaling the demonstration fixture.");
    expect(passage!.text).toContain("12. Perform synthetic operation 12");
    expect(passage!.text).toContain("synthetic rinse");
    expect(passage!.text).not.toContain("Other information");
  });

  it.each(["\n\n", "\n"])("keeps inter-step prose and missing illustrations when a headingless numbered procedure resumes (%j)", (separator) => {
    const parts = [
      "Descaling routine for the fictional fixture.",
      "1. Begin the synthetic first stage.",
      "Leave the fictional fixture untouched while it cools.",
      "<!-- image -->",
      "2. Finish the synthetic second stage.",
      "Storage",
      "Unrelated information about storing other products.",
    ];
    const text = `${preamble}${separator}${parts.join(separator)}`;
    const [passage] = selectDocumentPassages(text, "How do I descale?", { wholeDocumentChars: 0 });
    expect(passage!.text).toContain("1. Begin the synthetic first stage.");
    expect(passage!.text).toContain("Leave the fictional fixture untouched while it cools.");
    expect(passage!.text).toContain("<!-- image -->");
    expect(passage!.text).toContain("2. Finish the synthetic second stage.");
    expect(passage!.text).not.toContain("Unrelated information");
    expect(passage!.complete).toBe(true);
    expect(text.slice(passage!.start, passage!.end)).toBe(passage!.text);
  });

  it("finds a late headingless procedure when OCR lost all blank lines", () => {
    const text = `${preamble}Descaling the demonstration fixture.\nWarning: preserve this caution.\n${procedure}\nNote: check the missing figure.`;
    const [passage] = selectDocumentPassages(text, "How do I descale?");
    expect(passage!.text).toContain("Descaling the demonstration fixture.");
    expect(passage!.text).toContain("12. Perform synthetic operation 12");
    expect(passage!.complete).toBe(true);
  });

  it("understands setext headings and ignores heading syntax inside code fences", () => {
    const text = `\`\`\`text\n# Descaling\nThis is a quoted code example.\n\`\`\`\nCleaning the filter\n-------------------\nClean the fictional filter and preserve its warning.\nStorage\n-------\nUnrelated storage notes.`;
    const [passage] = selectDocumentPassages(text, "How do I clean the filter?", { wholeDocumentChars: 0 });
    expect(passage!.heading).toBe("Cleaning the filter");
    expect(passage!.text).not.toContain("Storage");
  });

  it("marks budget cuts explicitly and keeps formatting the warning with the original excerpt", () => {
    const [passage] = selectDocumentPassages(manual, "How do I descale?", { maxChars: 350 });
    expect(passage).toMatchObject({ complete: false, truncated: true });
    expect(passage!.text.length).toBeLessThanOrEqual(350);
    expect(passage!.text).not.toContain("12. Perform synthetic operation 12");
    expect(formatDocumentPassage(passage!)).toContain("INCOMPLETE SOURCE EXCERPT");
    expect(formatDocumentPassage(passage!)).toContain("Do not present this excerpt as a complete procedure");
    expect(manual.slice(passage!.start, passage!.end)).toBe(passage!.text);
  });

  it("keeps total raw source text within the shared character budget", () => {
    const text = `## Cleaning the wand\n${"Clean the fictional wand. ".repeat(30)}\n## Cleaning the filter\n${"Clean the fictional filter. ".repeat(30)}`;
    const passages = selectDocumentPassages(text, "How do I clean the wand and filter?", { maxChars: 1000, wholeDocumentChars: 0 });
    expect(passages.reduce((sum, p) => sum + p.text.length, 0)).toBeLessThanOrEqual(1000);
    expect(passages.some((p) => p.truncated)).toBe(true);
    expect(selectDocumentPassages(text, "clean filter", { maxChars: 0 })).toEqual([]);
  });
});
