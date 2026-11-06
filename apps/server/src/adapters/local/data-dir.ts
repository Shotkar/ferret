import { accessSync, constants, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

/** What Ferret writes inside its data folder, once it exists: the database (with SQLite's side files) and the files. */
const INSIDE = ["ferret.db", "ferret.db-wal", "ferret.db-shm", "files"];

/**
 * Makes sure Ferret can write to its data folder — and to what's already in it — before anything else touches it, and
 * stops with a plain explanation if it can't. The usual cause is a host folder (a bind mount) owned by another user
 * than the one Ferret runs as, or a folder made by one user and later run as another (a switch to Unraid's 99:100).
 */
export function ensureDataDir(dir: string): void {
  let blocked = dir;
  let code: string;
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    for (const name of INSIDE) {
      blocked = path.join(dir, name);
      if (existsSync(blocked)) accessSync(blocked, constants.R_OK | constants.W_OK);
    }
    return;
  } catch (err) {
    code = (err as NodeJS.ErrnoException).code ?? String(err);
  }
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  const who = uid === undefined ? "the user Ferret runs as" : `user ${uid}, group ${gid}`;
  const owner = uid === undefined ? "<uid>:<gid>" : `${uid}:${gid}`;
  console.error(
    [
      blocked === dir
        ? `Ferret can't write to its data folder ${dir} (${code}).`
        : `Ferret can't write to ${blocked} in its data folder (${code}).`,
      `It runs as ${who}. Give that user the data folder and everything in it, on the host, e.g.`,
      `  chown -R ${owner} /path/to/ferret-data`,
      `or run the container as the folder's owner (docker run --user, compose "user:").`,
    ].join("\n"),
  );
  process.exit(1);
}
