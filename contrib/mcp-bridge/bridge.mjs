// Ferret's MCP server for clients that start a local process and talk to it over stdio (Docker's MCP Toolkit, and
// anything else that can't send a header to a remote server). It forwards each message to your Ferret's /mcp with an
// API key and prints the answers. No dependencies: Node's own fetch and readline.
//
//   FERRET_URL=https://ferret.example.com FERRET_API_KEY=ferret_… node bridge.mjs
//
// Logs go to stderr; stdout carries only MCP messages.
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const log = (...a) => console.error("[ferret]", ...a);

/** Forwards newline-delimited JSON-RPC from stdin to `<url>/mcp` and writes each answer (JSON or SSE) to stdout. */
export function bridge(url, key) {
  const endpoint = /\/mcp\/?$/.test(url) ? url : `${url.replace(/\/+$/, "")}/mcp`;
  const out = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  const fail = (msg, message) => msg?.id !== undefined && out({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message } });

  const lines = createInterface({ input: process.stdin });
  // Answers still on their way when stdin closes are waited for before exiting.
  const pending = new Set();
  lines.on("line", (line) => {
    const p = forward(line).finally(() => pending.delete(p));
    pending.add(p);
  });
  lines.on("close", async () => {
    await Promise.allSettled([...pending]);
    process.exit(0);
  });

  async function forward(line) {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return log("ignored a line that isn't JSON");
    }
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-API-Key": key },
        body: line,
      });
      if (res.status === 202 || res.status === 204) return; // a notification
      const text = await res.text();
      if (res.status === 401 || res.status === 403) {
        log(`Ferret refused the API key (${res.status}) — check FERRET_API_KEY`);
        return fail(msg, "Ferret refused the API key: make a new one in Ferret (Household & settings → Claude & API) and set FERRET_API_KEY");
      }
      if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
        for (const event of text.split(/\r?\n\r?\n/)) {
          const data = event
            .split(/\r?\n/)
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trimStart())
            .join("\n");
          if (data) out(JSON.parse(data));
        }
      } else if (text) {
        out(JSON.parse(text));
      } else if (!res.ok) {
        fail(msg, `Ferret answered ${res.status}`);
      }
    } catch (error) {
      log(`couldn't reach ${endpoint}:`, error?.cause?.message ?? error?.message ?? error);
      fail(msg, `Couldn't reach Ferret at ${endpoint} — check FERRET_URL (${error?.cause?.code ?? error?.message ?? "error"})`);
    }
  }
}

// Run directly: settings from the environment.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.FERRET_URL?.trim();
  const key = process.env.FERRET_API_KEY?.trim();
  if (!url || !/^https?:\/\//.test(url)) {
    log("Set FERRET_URL to your Ferret's address, e.g. https://ferret.example.com");
    process.exit(1);
  }
  if (!key) {
    log("Set FERRET_API_KEY to an API key from Ferret (Settings → Claude & API → New key)");
    process.exit(1);
  }
  bridge(url, key);
}
