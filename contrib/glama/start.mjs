// For Glama's directory check only (contrib/glama/README.md): starts a throwaway Ferret, makes its first account, a
// household and an API key, then bridges MCP over stdio to Ferret's /mcp — so `mcp-proxy` can wrap it like any stdio
// server. Logs go to stderr; stdout carries only MCP messages.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const BASE = process.env.PUBLIC_URL ?? "http://localhost:8787";
const KEY_FILE = "/tmp/ferret-glama-key";
const log = (...a) => console.error("[glama]", ...a);

const healthy = () => fetch(`${BASE}/healthz`).then((r) => r.ok, () => false);

async function startFerret() {
  if (await healthy()) return; // another session already started it
  const server = spawn("node", ["/app/dist/server.js"], { cwd: "/app", stdio: ["ignore", process.stderr, process.stderr], detached: true });
  server.unref();
  for (let i = 0; i < 120; i++) {
    if (await healthy()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Ferret didn't start");
}

/** A session cookie for the first account (made on first run, signed in afterwards). */
async function signIn() {
  const body = { name: "Glama", email: "glama@example.com", password: "glama-check-only-not-a-secret" };
  const post = (path, data) =>
    fetch(`${BASE}/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify(data) });
  await post("sign-up/email", body); // fails harmlessly once the account exists
  const res = await post("sign-in/email", { email: body.email, password: body.password });
  if (!res.ok) throw new Error(`Couldn't sign in: ${res.status} ${await res.text()}`);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

async function apiKey() {
  if (existsSync(KEY_FILE)) return readFileSync(KEY_FILE, "utf8");
  const cookie = await signIn();
  const call = async (path, data) => {
    const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE, Cookie: cookie }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
    return res.json();
  };
  const household = await call("/api/auth/organization/create", { name: "Glama check", slug: "glama-check" });
  await call("/api/auth/organization/set-active", { organizationId: household.id });
  const { key } = await call("/api/v1/api-keys", { name: "Glama check", readOnly: false });
  writeFileSync(KEY_FILE, key, { mode: 0o600 });
  return key;
}

await startFerret();
const key = await apiKey();
log("Ferret is up; bridging stdio to /mcp");

// One JSON-RPC message a line in; each answer (JSON or an SSE stream) out as lines.
const out = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const lines = createInterface({ input: process.stdin });
lines.on("line", async (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  try {
    const res = await fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-API-Key": key },
      body: line,
    });
    if (res.status === 202 || res.status === 204) return; // a notification
    const text = await res.text();
    if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
      for (const event of text.split(/\r?\n\r?\n/)) {
        const data = event.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
        if (data) out(JSON.parse(data));
      }
    } else if (text) {
      out(JSON.parse(text));
    }
  } catch (error) {
    log(error);
    if (msg.id !== undefined) out({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: String(error) } });
  }
});
lines.on("close", () => process.exit(0));
