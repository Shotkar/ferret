// The Docker image's node_modules: only what the bundled server keeps outside it (build.mjs's externals) and what they
// need, out of a hoisted `pnpm install --frozen-lockfile` — so every version is the lockfile's. Everything else goes.
// Usage: node runtime-deps.mjs <node_modules dir>
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "node_modules");
const KEEP = ["@libsql/client", "libsql", "sharp", "pdfjs-dist", "@napi-rs/canvas"];

/** Where `name` resolves from `from` (a package's directory), the way Node looks it up. */
function find(name, from) {
  for (let dir = from; dir.startsWith(root); dir = path.dirname(dir)) {
    const candidate = path.join(dir, path.basename(dir) === "node_modules" ? "" : "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
    if (dir === root) break;
  }
  return null;
}

const kept = new Set();
const queue = KEEP.map((name) => find(name, root)).filter(Boolean);
while (queue.length) {
  const dir = queue.pop();
  if (kept.has(dir)) continue;
  kept.add(dir);
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
    const found = find(dep, dir);
    if (found) queue.push(found); // an optional one for another platform isn't installed
  }
}

/** Top-level packages (and scoped ones) not kept are removed; nested node_modules go with their parent. */
let removed = 0;
for (const entry of readdirSync(root)) {
  if (entry.startsWith(".")) continue;
  const dirs = entry.startsWith("@") ? readdirSync(path.join(root, entry)).map((n) => path.join(root, entry, n)) : [path.join(root, entry)];
  for (const dir of dirs) {
    if ([...kept].some((k) => k === dir || k.startsWith(dir + path.sep))) continue;
    rmSync(dir, { recursive: true, force: true });
    removed++;
  }
}
for (const entry of readdirSync(root)) {
  if (entry.startsWith("@") && !readdirSync(path.join(root, entry)).length) rmSync(path.join(root, entry), { recursive: true });
}
rmSync(path.join(root, ".bin"), { recursive: true, force: true });
console.log(`runtime node_modules: kept ${kept.size} packages, removed ${removed}`);
