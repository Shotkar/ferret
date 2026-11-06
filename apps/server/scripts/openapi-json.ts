/**
 * Writes the API's OpenAPI description to a file — for the help, which builds its API reference from it
 * (apps/docs/api-pages.mjs). The address is a placeholder; the help swaps in the real one when a Ferret serves it.
 *
 *   tsx scripts/openapi-json.ts <out.json>
 */
import { writeFileSync } from "node:fs";
import { openApiDocument } from "../src/lib/openapi";

const out = process.argv[2];
if (!out) throw new Error("usage: tsx scripts/openapi-json.ts <out.json>");
writeFileSync(out, JSON.stringify(openApiDocument("https://ferret.example.com"), null, 1));
