// Before `vitepress build` / `dev`: the API reference as help pages, made from the server's OpenAPI description
// (.vitepress/openapi.json, written by apps/server/scripts/openapi-json.ts). api/index.md is the introduction, then one
// page per area (api/<area>.md), each endpoint a ## section with its fields and a request in curl / JavaScript / Python.
// Generated, so api/ is gitignored; the sidebar goes to .vitepress/api-sidebar.json for config.ts. Being pages, the
// endpoints are in the help's search and in help.json.
//
// Requests use https://ferret.example.com; on a real Ferret the theme swaps in the address the help is served from.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = import.meta.dirname;
const doc = JSON.parse(readFileSync(path.join(root, ".vitepress/openapi.json"), "utf8"));
const base = doc.servers[0].url;
const outDir = path.join(root, "api");

const areaSlug = (tag) => tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Text from the server, safe in a VitePress page: no HTML, no Vue interpolation. Backticks stay code. */
const text = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{\{/g, "&#123;&#123;")
    .replace(/\|/g, "\\|");

/** "string", "integer (≤ 1000)", "one of: a, b", "list of string"… */
function describe(s) {
  if (!s) return "";
  if (s.enum) return `one of: ${s.enum.join(", ")}`;
  if (s.anyOf)
    return [...new Set(s.anyOf.map(describe).filter((t) => t && t !== "null"))].join(" or ") + (s.anyOf.some((a) => a.type === "null") ? " (or null)" : "");
  const type = Array.isArray(s.type) ? s.type.filter((t) => t !== "null").join(" | ") + (s.type.includes("null") ? " (or null)" : "") : (s.type ?? "any");
  if (type === "array") return `list of ${describe(s.items)}`;
  const limits = [
    s.format,
    s.maxLength !== undefined && `≤ ${s.maxLength} chars`,
    s.minimum !== undefined && `≥ ${s.minimum}`,
    s.maximum !== undefined && s.maximum < Number.MAX_SAFE_INTEGER && `≤ ${s.maximum}`,
  ]
    .filter(Boolean)
    .join(", ");
  return limits ? `${type} (${limits})` : type;
}

// ── Examples made from the schemas ──────────────────────────────────────────

/** Believable values for the fields people send most; anything else gets one by its type. */
const SAMPLE = {
  name: "Cordless drill",
  q: "drill",
  question: "Where is the drill?",
  brand: "DEWALT",
  model: "DCD791D2",
  serialNumber: "3141592",
  barcode: "0885911475167",
  email: "sam@example.com",
  person: "Sam (next door)",
  title: "Replace the furnace filter",
  provider: "DEWALT",
  tag: "insured",
  description: "With two batteries and the charger",
  notes: "Lives on the pegboard",
  url: "https://example.com/manual.pdf",
  code: "K7Q2MX",
};

function sample(name, s, depth = 0) {
  if (!s) return null;
  if (name in SAMPLE && (s.type === "string" || !s.type || s.anyOf)) return SAMPLE[name];
  if (s.default !== undefined) return s.default;
  if (s.enum) return s.enum[0];
  if (s.anyOf) return sample(name, s.anyOf.find((a) => a.type !== "null"), depth);
  const type = Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type;
  switch (type) {
    case "object":
      return depth > 2 ? {} : body(s, depth + 1);
    case "array":
      return [sample(name.replace(/s$/, ""), s.items, depth + 1)];
    case "boolean":
      return true;
    case "integer":
    case "number":
      return /Cents$/.test(name) ? 9_900 : /[Qq]uantity|count|step/.test(name) ? 1 : (s.minimum ?? 1);
    default:
      if (s.format === "date" || /On$|Date$/.test(name)) return "2026-10-24";
      if (s.format === "email") return "sam@example.com";
      if (s.format === "uri" || /url$/i.test(name)) return "https://example.com";
      return "…";
  }
}

/** A JSON body: the required fields, then optional ones up to four in all. */
function body(s, depth = 0) {
  const props = Object.entries(s.properties ?? {});
  const required = props.filter(([n]) => s.required?.includes(n));
  const optional = props.filter(([n]) => !s.required?.includes(n) && !/Id$/.test(n));
  const chosen = [...required, ...optional.slice(0, Math.max(0, 4 - required.length))];
  return Object.fromEntries(chosen.map(([n, p]) => [n, sample(n, p, depth)]));
}

/** The same request three ways. Path parameters show as <id>. */
function examples(pathName, method, op) {
  const json = op.requestBody?.content["application/json"]?.schema;
  const upload = op.requestBody?.content["multipart/form-data"];
  const open = op.security.length === 0;
  const hasQ = op.parameters.some((p) => p.in === "query" && p.name === "q");
  const url = `${base}${pathName.replace(/\{(\w+)\}/g, "<$1>")}${hasQ && method === "get" ? "?q=drill" : ""}`;
  const M = method.toUpperCase();
  const payload = json ? JSON.stringify(body(json), null, 2) : null;

  const curl = [
    `curl${method === "get" ? "" : ` -X ${M}`} "${url}"`,
    !open && `  -H "Authorization: Bearer $FERRET_KEY"`,
    payload && `  -H "Content-Type: application/json"`,
    payload && `  -d '${payload.replace(/\n/g, "\n  ")}'`,
    upload && `  -F file=@photo.jpg -F kind=photo`,
  ]
    .filter(Boolean)
    .join(" \\\n");

  const headers = [!open && "Authorization: `Bearer ${process.env.FERRET_KEY}`", payload && `"Content-Type": "application/json"`].filter(Boolean);
  const js = [
    upload && `const form = new FormData();\nform.append("file", photoBlob, "photo.jpg");\nform.append("kind", "photo");\n`,
    `const res = await fetch("${url}", {`,
    method !== "get" && `  method: "${M}",`,
    headers.length && `  headers: { ${headers.join(", ")} },`,
    payload && `  body: JSON.stringify(${payload.replace(/^(\s*)"(\w+)":/gm, "$1$2:").replace(/\n/g, "\n  ")}),`,
    upload && `  body: form,`,
    `});`,
    `if (!res.ok) throw new Error((await res.json()).error.message);`,
    op.responses["204"] ? null : `const data = await res.json();`,
  ]
    .filter(Boolean)
    .join("\n");

  const py = (v) => JSON.stringify(v, null, 4).replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False").replace(/\bnull\b/g, "None");
  const args = [
    `"${url}"`,
    !open && `headers={"Authorization": f"Bearer {os.environ['FERRET_KEY']}"}`,
    json && `json=${py(body(json)).replace(/\n/g, "\n    ")}`,
    upload && `files={"file": open("photo.jpg", "rb")}, data={"kind": "photo"}`,
  ].filter(Boolean);
  const python = [`import os, requests`, ``, `r = requests.${method}(\n    ${args.join(",\n    ")},\n)`, `r.raise_for_status()`, op.responses["204"] ? null : `print(r.json())`]
    .filter((l) => l !== null)
    .join("\n");

  return { curl, js, python };
}

const codeGroup = ({ curl, js, python }) => ["::: code-group", "```sh [cURL]", curl, "```", "```js [JavaScript]", js, "```", "```python [Python]", python, "```", ":::"].join("\n");

// ── Pages ───────────────────────────────────────────────────────────────────

const fields = (title, rows) =>
  rows.length
    ? [
        `**${title}**`,
        "",
        ...rows.map(
          (r) => `- \`${r.name}\` <span class="api-type">${text(r.type)}${r.required ? ' · <span class="api-required">required</span>' : ""}</span>${r.about ? ` — ${text(r.about)}` : ""}`,
        ),
        "",
      ]
    : [];

function endpoint(pathName, method, op) {
  const json = op.requestBody?.content["application/json"]?.schema;
  const upload = op.requestBody?.content["multipart/form-data"]?.schema;
  const session = op.security.length === 1 && "session" in op.security[0];
  const open = op.security.length === 0;
  // The server appends these to the description; here they're a badge and the Returns line.
  const writes = op.description?.includes("Not for read-only keys or viewers.") ?? false;
  const returns = op.description?.match(/Returns: ([\s\S]+?)\.?$/)?.[1];
  const words = op.description?.replace("Not for read-only keys or viewers.", "").replace(/Returns: [\s\S]+$/, "").trim();
  const badges = [
    writes && '<Badge type="warning" text="changes things" />',
    session && '<Badge type="danger" text="sign-in only" />',
    open && '<Badge type="tip" text="no key" />',
  ].filter(Boolean);
  const ok = Object.keys(op.responses).find((s) => s.startsWith("2"));
  const okType = Object.keys(op.responses[ok]?.content ?? {})[0];

  return [
    `## ${text(op.summary)} {#${op.operationId}}`,
    "",
    `<p class="api-op"><span class="api-method api-${method}">${method.toUpperCase()}</span> <code>${text(pathName)}</code>${badges.length ? ` ${badges.join(" ")}` : ""}</p>`,
    "",
    ...(words ? [text(words), ""] : []),
    ...fields(
      "Path",
      op.parameters.filter((p) => p.in === "path").map((p) => ({ name: p.name, type: "string", required: true, about: p.description })),
    ),
    ...fields(
      "Query",
      op.parameters.filter((p) => p.in === "query").map((p) => ({ name: p.name, type: describe(p.schema), required: false, about: p.description ?? p.schema.description })),
    ),
    ...fields(
      "Body (JSON)",
      Object.entries(json?.properties ?? {}).map(([name, s]) => ({ name, type: describe(s), required: json.required?.includes(name) ?? false, about: s.description })),
    ),
    ...fields(
      "Body (multipart form)",
      Object.entries(upload?.properties ?? {}).map(([name, s]) => ({ name, type: s.format === "binary" ? "the file" : describe(s), required: upload.required?.includes(name) ?? false })),
    ),
    codeGroup(examples(pathName, method, op)),
    "",
    `**Returns** ${ok}${ok === "204" ? " (nothing)" : returns ? ` — \`${returns.replace(/`/g, "")}\`` : ""}${okType && okType !== "application/json" ? ` · ${okType}` : ""}.`,
    "",
  ].join("\n");
}

const areas = doc.tags
  .map(({ name }) => ({
    name,
    slug: areaSlug(name),
    endpoints: Object.entries(doc.paths).flatMap(([p, ops]) => Object.entries(ops).filter(([, op]) => op.tags[0] === name).map(([m, op]) => ({ path: p, method: m, op }))),
  }))
  .filter((a) => a.endpoints.length);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir);

for (const area of areas) {
  const page = [
    "---",
    `title: ${area.name} · API`,
    "---",
    "",
    `# ${area.name}`,
    "",
    `${area.endpoints.length} endpoint${area.endpoints.length === 1 ? "" : "s"} of the [Ferret API](./). Each call needs an API key unless it says otherwise; anything that fails answers as in [Errors](./#errors). {.api-lead}`,
    "",
    ...area.endpoints.map((e) => endpoint(e.path, e.method, e.op)),
  ].join("\n");
  writeFileSync(path.join(outDir, `${area.slug}.md`), page);
}

const start = examples("/items", "get", { security: [{ apiKey: [] }], parameters: [{ name: "q", in: "query", schema: {} }], responses: { 200: {} } });
const index = `---
title: API reference
---

# Ferret API

Everything the app does, for your own scripts and tools: add things, search them, log maintenance, read the insurance
report. REST and JSON, described as [OpenAPI 3.1](#openapi). Claude uses the same household through MCP — see
[Claude and the API](../guide/claude).

## Quick start

1. Make a key in [Settings → Claude & API](/../#/settings/api){target="_self"}. It starts with \`ferret_\` and is shown once.
2. Send it with every request as \`Authorization: Bearer ferret_…\`.
3. Every call acts in the key's household. The base address is \`${base}\`.

${codeGroup(start)}

## Keys

A key belongs to you and to one household. If you leave the household, the key stops working.

**Read-only keys** can call everything except the endpoints marked <Badge type="warning" text="changes things" />. Some
endpoints are <Badge type="danger" text="sign-in only" />: they need the app's own sign-in, never a key.

The key can go in \`x-api-key\` instead, if your tool can't set a bearer token:

\`\`\`http
Authorization: Bearer ferret_…
x-api-key: ferret_…
\`\`\`

## Errors

Anything that isn't a success comes back with a status and the same shape. \`message\` is written for people: show it.

| Status | Means |
|---|---|
| 401 | No key, or one that's been revoked |
| 402 | The household's plan doesn't include it |
| 403 | A read-only key or a viewer trying to change something |
| 404 | Not found in this household |
| 409 | It conflicts with something already there |
| 413 | Too big: JSON bodies are 1 MB at most |
| 422 | Invalid input — \`details\` says which field |
| 429 | Too many requests: slow down |

\`\`\`json
${JSON.stringify({ error: { code: "http_422", message: "Invalid input", details: [{ path: ["name"], message: "Too small: expected string to have >=1 characters" }] } }, null, 2)}
\`\`\`

## Pages of results

Lists come a page at a time: \`limit\` (up to 200, 50 if not given) and \`offset\`. When there's more, \`more\` is true —
ask again with a bigger offset.

Money is in cents (9900 is $99.00). Dates are yyyy-mm-dd; moments are ISO 8601 in UTC.

\`\`\`sh
curl "${base}/items?limit=50&offset=50" \\
  -H "Authorization: Bearer $FERRET_KEY"
\`\`\`

## OpenAPI

Every Ferret describes its API at \`/api/v1/openapi.json\` (no key needed) — import it into Postman, Bruno or Insomnia,
or generate a client from it. <a href="/api/v1/openapi.json" download="ferret-openapi.json" target="_self">Download this Ferret's</a>.

## Endpoints

${areas.map((a) => `- [${a.name}](./${a.slug}) — ${a.endpoints.length}`).join("\n")}
`;
writeFileSync(path.join(outDir, "index.md"), index);

writeFileSync(
  path.join(root, ".vitepress/api-sidebar.json"),
  JSON.stringify([
    {
      text: "Introduction",
      items: [
        { text: "Quick start", link: "/api/#quick-start" },
        { text: "Keys", link: "/api/#keys" },
        { text: "Errors", link: "/api/#errors" },
        { text: "Pages of results", link: "/api/#pages-of-results" },
        { text: "OpenAPI", link: "/api/#openapi" },
      ],
    },
    { text: "Endpoints", items: areas.map((a) => ({ text: a.name, link: `/api/${a.slug}` })) },
  ]),
);
console.log(`api pages: ${areas.length} areas, ${areas.reduce((n, a) => n + a.endpoints.length, 0)} endpoints`);
