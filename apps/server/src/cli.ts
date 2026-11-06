/**
 * Ferret from the command line (Node), for what's done on the server itself. In the container:
 *   docker compose exec ferret node dist/cli.js admin                  who the server admin is
 *   docker compose exec ferret node dist/cli.js admin you@example.com  hand it to another (confirmed) account
 *   docker compose run --rm ferret node dist/cli.js backup list
 *   docker compose run --rm ferret node dist/cli.js backup check [snapshot]
 *   docker compose run --rm -v /path/to/new-data:/restore ferret node dist/cli.js backup restore /restore [snapshot]
 *   docker compose exec ferret node dist/cli.js key fingerprint                  which FILES_KEY is in use
 *   docker compose exec -it ferret node dist/cli.js key export /backups          the secrets, sealed with a passphrase
 *   docker compose run --rm -v ./ferret-key-….json:/k.json ferret node dist/cli.js key recover /k.json [/data]
 *   docker compose run --rm ferret node dist/cli.js secrets new AUTH_SECRET     a new one, on purpose (when it's lost)
 * Reads .env (DATA_DIR, BACKUP_DIR, and the secrets — else the ones Ferret made, in DATA_DIR/secrets.json).
 * In dev: pnpm --filter @ferret/server cli admin
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { FolderBackupTarget, SqliteSnapshots } from "./adapters/local/backup";
import { createLocalDb } from "./adapters/local/db";
import { restoreBackup } from "./adapters/local/restore";
import { checkSnapshot, listSnapshots, readManifest } from "./lib/backup";
import { serverAdmin, setServerAdmin } from "./lib/server-admin";
import { masterKeyId } from "./lib/files";
import { openKeyFile, passphraseProblem, sealKeyFile } from "./lib/key-file";
import { recordKeyFile } from "./lib/key-file-log";
import { DbJobs } from "./adapters/local/jobs";
import { SECRETS_FILE, currentSecrets, readStoredSecrets, replaceAuthSecret, writeStoredSecrets } from "./adapters/local/secrets";

const USAGE = `Usage: cli.js admin [email] | backup list | backup check [snapshot] | backup restore <data folder> [snapshot]
       | key fingerprint | key export <folder or file> | key recover <key file> [data folder] | secrets new AUTH_SECRET`;
const [command, ...args] = process.argv.slice(2);
const dataDir = () => path.resolve(process.env.DATA_DIR?.trim() || "./data");
const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} (it's in .env).`);
  return value;
};
/** FILES_KEY from the settings, else the one Ferret made (secrets.json). */
const filesKeyInUse = () => {
  const key = currentSecrets(process.env, dataDir()).FILES_KEY;
  if (!key) throw new Error("No FILES_KEY: not in the settings, nor made by Ferret in this data folder. Lost it? cli.js key recover <key file>.");
  return key;
};

async function admin(email?: string) {
  const dbFile = path.join(path.resolve(process.env.DATA_DIR ?? "./data"), "ferret.db");
  const { db, client } = createLocalDb(`file:${dbFile}`);
  try {
    const who = email ? await setServerAdmin(db, email) : await serverAdmin(db);
    console.log(who ? `${email ? "The server admin is now" : "Server admin:"} ${who.name} <${who.email}>` : "No accounts yet");
  } finally {
    client.close();
  }
}

async function backup(sub: string | undefined, rest: string[]) {
  const filesKey = filesKeyInUse();
  const target = new FolderBackupTarget(path.resolve(env("BACKUP_DIR")));
  if (sub === "list") {
    for (const name of await listSnapshots(target)) {
      const m = await readManifest(target, name);
      console.log(`${name}  ${m.createdAt}  ${m.counts.items} items, ${m.files.length} files`);
    }
  } else if (sub === "check") {
    const name = rest[0] ?? (await listSnapshots(target))[0];
    if (!name) throw new Error(`No backups in ${target.where}`);
    const { summary } = await checkSnapshot({ snapshots: new SqliteSnapshots(createLocalDb(":memory:").db), target, filesKey }, name);
    console.log(`${name}: ${summary}`);
  } else if (sub === "restore" && rest[0]) {
    const into = path.resolve(rest[0]);
    await restoreBackup({ target, filesKey, dataDir: into, snapshot: rest[1], log: console.log });
    // The secrets Ferret made go with the restored folder, so it starts as it was (backups never hold them).
    const stored = readStoredSecrets(dataDir());
    if (Object.keys(stored).length && !existsSync(path.join(into, SECRETS_FILE))) {
      writeStoredSecrets(into, stored);
      console.log(`Copied the secrets Ferret made (${SECRETS_FILE}) into ${into}.`);
    }
  } else {
    throw new Error(USAGE);
  }
}

/**
 * Asks for a passphrase without showing it. Without a terminal (piped in), reads one line — so `docker exec -i` and
 * scripts work too.
 */
async function askHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    const rl = createInterface({ input: stdin });
    const line = await new Promise<string>((resolve) => rl.once("line", resolve).once("close", () => resolve("")));
    rl.close();
    return line;
  }
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          done();
          return resolve(value);
        } else if (ch === "\u0003") {
          done();
          return reject(new Error("Cancelled."));
        } else if (ch === "\u007f" || ch === "\b") {
          value = [...value].slice(0, -1).join("");
        } else if (ch >= " ") {
          value += ch;
        }
      }
    };
    const done = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
    };
    stdin.on("data", onData);
  });
}

/** Records the key file in Ferret's database and tells the server admin (lib/key-file-log.ts) — once it's written. */
async function noteKeyFile(record: { at: string; keyId: string; where: string }) {
  const dbFile = path.join(dataDir(), "ferret.db");
  if (!existsSync(dbFile)) return console.log("(No Ferret database here, so the server admin isn't told about this key file.)");
  const { db, client } = createLocalDb(`file:${dbFile}`);
  try {
    await recordKeyFile(db, new DbJobs(db), record);
    console.log("The server admin will be told, and Settings → Server shows it.");
  } catch (err) {
    console.log(`(Couldn't note the key file in Ferret's database: ${err instanceof Error ? err.message : String(err)})`);
  } finally {
    client.close();
  }
}

async function key(sub: string | undefined, rest: string[]) {
  if (sub === "fingerprint") {
    console.log(`FILES_KEY fingerprint: ${await masterKeyId(filesKeyInUse())}`);
  } else if (sub === "export" && rest[0]) {
    const secrets = { ...currentSecrets(process.env, dataDir()), FILES_KEY: filesKeyInUse() };
    const keyId = await masterKeyId(secrets.FILES_KEY);
    const target = path.resolve(rest[0]);
    const file = existsSync(target) && statSync(target).isDirectory() ? path.join(target, `ferret-key-${keyId}.json`) : target;
    const held = Object.keys(secrets).filter((k) => secrets[k as keyof typeof secrets]);
    console.log(`The key file holds this server's secrets (${held.join(", ")}), sealed with a passphrase.`);
    console.log("Anyone with the file can try passphrases offline, so make it long — a few unrelated words. Without the");
    console.log("passphrase, the file is no use to anyone, you included.");
    const passphrase = await askHidden("Passphrase: ");
    const problem = passphraseProblem(passphrase);
    if (problem) throw new Error(problem);
    if (process.stdin.isTTY && (await askHidden("Again: ")) !== passphrase) throw new Error("The two didn't match.");
    const sealed = await sealKeyFile(secrets, passphrase);
    writeFileSync(file, `${JSON.stringify(sealed, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    console.log(`Written: ${file} (FILES_KEY ${keyId})`);
    console.log("Copy it off this server — beside the backups is fine — and keep the passphrase in your password manager.");
    await noteKeyFile({ at: new Date().toISOString(), keyId, where: file });
  } else if (sub === "recover" && rest[0]) {
    const file = JSON.parse(readFileSync(path.resolve(rest[0]), "utf8")) as unknown;
    const secrets = await openKeyFile(file, await askHidden("Passphrase: "));
    if (rest[1]) {
      // Into a data folder: Ferret uses them from there (unless its settings set others).
      const into = path.resolve(rest[1]);
      writeStoredSecrets(into, { ...readStoredSecrets(into), ...secrets });
      console.log(`Written: ${path.join(into, SECRETS_FILE)} (${Object.keys(secrets).join(", ")}). Start Ferret with that data folder.`);
      console.log("Values in Ferret's settings still win over these — leave those empty, or set them to the same.");
    } else {
      for (const [name, value] of Object.entries(secrets)) console.log(`${name}=${value}`);
      console.log("Put those in Ferret's settings (.env, the Unraid template, the TrueNAS app) — or name a data folder after");
      console.log("the key file to write them there instead — and start Ferret.");
    }
  } else {
    throw new Error(USAGE);
  }
}

/** `secrets new AUTH_SECRET`: when it's lost for good. Signs everyone out; two-step sign-in is set up again. */
async function secretsCommand(sub: string | undefined, rest: string[]) {
  if (sub !== "new" || rest[0] !== "AUTH_SECRET") throw new Error(USAGE);
  if (process.env.AUTH_SECRET?.trim()) {
    throw new Error("AUTH_SECRET is set in Ferret's settings — change it there (or empty it, then run this again).");
  }
  const dbFile = path.join(dataDir(), "ferret.db");
  if (!existsSync(dbFile)) throw new Error(`No Ferret database in ${dataDir()}.`);
  const { db, client } = createLocalDb(`file:${dbFile}`);
  try {
    const reset = await replaceAuthSecret(dataDir(), db);
    console.log(`A new AUTH_SECRET is in ${path.join(dataDir(), SECRETS_FILE)}. Restart Ferret: everyone signs in again.`);
    if (reset) console.log(`Two-step sign-in was turned off for ${reset} ${reset === 1 ? "account" : "accounts"}; they set it up again in Settings → Security.`);
  } finally {
    client.close();
  }
}

try {
  if (command === "admin") await admin(args[0]);
  else if (command === "key") await key(args[0], args.slice(1));
  else if (command === "secrets") await secretsCommand(args[0], args.slice(1));
  else if (command === "backup") await backup(args[0], args.slice(1));
  else throw new Error(USAGE);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
