/**
 * The secrets Ferret needs, made for you when they aren't set. A value in the settings (.env, the Unraid template, the
 * TrueNAS app) always wins; otherwise Ferret uses the one it made before, kept in DATA_DIR/secrets.json (readable by its
 * own user only, and never copied into Ferret's backups) — or makes one, the right way, the first time.
 *
 * What each is worth if it's lost decides what happens when one goes missing on a server already in use:
 *  - FILES_KEY seals every household's files and the backups. A new one opens nothing, so Ferret never makes one once
 *    anything is sealed: it stops and says how to bring it back (a saved copy, or a key file).
 *  - AUTH_SECRET signs sign-ins and seals two-step sign-in secrets. A new one signs everyone out and breaks two-step
 *    sign-in, so Ferret doesn't swap it by itself once there are accounts: it stops, and `cli.js secrets new AUTH_SECRET`
 *    does it on purpose.
 *  - The push (VAPID) keys only identify this server to browsers' push services. New ones just mean each device turns
 *    push on again, so they're remade by themselves (and the subscriptions made with the old ones dropped).
 */
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { count } from "drizzle-orm";
import { householdKey, pushSubscription, twoFactor, user } from "../../db/schema";
import type { Db } from "../../ports";

export const SECRETS_FILE = "secrets.json";
export const SECRET_NAMES = ["AUTH_SECRET", "FILES_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"] as const;
export type SecretName = (typeof SECRET_NAMES)[number];
export type Secrets = Partial<Record<SecretName, string>>;
/** Where each secret in use came from: the settings, or made by Ferret (secrets.json). */
export type SecretSources = Partial<Record<SecretName, "settings" | "ferret">>;

const set = (v: string | undefined) => (v && v.trim() ? v : undefined);

/** The secrets Ferret made before, or {} — throws on a file that's there but isn't one (rather than make new ones). */
export function readStoredSecrets(dataDir: string): Secrets {
  const file = path.join(dataDir, SECRETS_FILE);
  if (!existsSync(file)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(`${file} isn't readable JSON. Fix or remove it — removing it loses the secrets in it.`);
  }
  const out: Secrets = {};
  for (const name of SECRET_NAMES) {
    const v = (parsed as Record<string, unknown>)?.[name];
    if (typeof v === "string" && v) out[name] = v;
  }
  return out;
}

/** Writes secrets.json: a temporary file first, then renamed over, so a crash never leaves half of one. */
export function writeStoredSecrets(dataDir: string, secrets: Secrets) {
  const file = path.join(dataDir, SECRETS_FILE);
  const body = { format: "ferret-secrets", version: 1, note: "Made by Ferret. Values set in Ferret's settings win over these.", ...secrets };
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}

/** The secrets in use: the settings' where set, else the stored ones — what `key export` seals. */
export function currentSecrets(env: Record<string, string | undefined>, dataDir: string): Secrets {
  const stored = readStoredSecrets(dataDir);
  const out: Secrets = {};
  for (const name of SECRET_NAMES) {
    const v = set(env[name]) ?? stored[name];
    if (v) out[name] = v;
  }
  return out;
}

export function newFilesKey() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
}

export function newAuthSecret() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
}

/** A VAPID key pair in web-push's format: the 65-byte public point and the 32-byte private scalar, base64url. */
export async function newVapidKeys() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as { publicKey: CryptoKey; privateKey: CryptoKey };
  const pub = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as { d?: string };
  const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { VAPID_PUBLIC_KEY: b64url(pub), VAPID_PRIVATE_KEY: jwk.d! };
}

export class MissingSecret extends Error {}

/**
 * Fills in the secrets the settings leave out (see the top of this file), keeping what Ferret made before. Returns the
 * environment to load the config from, where each secret came from, and what was made just now (for the log).
 */
export async function resolveSecrets(opts: { dataDir: string; env: Record<string, string | undefined>; db: Db }) {
  const { dataDir, env, db } = opts;
  const stored = readStoredSecrets(dataDir);
  const next: Secrets = { ...stored };
  const sources: SecretSources = {};
  const made: string[] = [];
  const out = { ...env };

  // FILES_KEY
  if (set(env.FILES_KEY)) sources.FILES_KEY = "settings";
  else if (stored.FILES_KEY) {
    out.FILES_KEY = stored.FILES_KEY;
    sources.FILES_KEY = "ferret";
  } else {
    const [sealed] = await db.select({ n: count() }).from(householdKey);
    if (sealed && sealed.n > 0) {
      throw new MissingSecret(
        [
          "FILES_KEY isn't set, and this server's files are already sealed with one — a new key couldn't open them.",
          "Put the original back in Ferret's settings (your password manager), or recover it from a key file:",
          `  node dist/cli.js key recover /path/to/ferret-key-….json ${dataDir}`,
        ].join("\n"),
      );
    }
    next.FILES_KEY = out.FILES_KEY = newFilesKey();
    sources.FILES_KEY = "ferret";
    made.push("FILES_KEY");
  }

  // AUTH_SECRET
  if (set(env.AUTH_SECRET)) sources.AUTH_SECRET = "settings";
  else if (stored.AUTH_SECRET) {
    out.AUTH_SECRET = stored.AUTH_SECRET;
    sources.AUTH_SECRET = "ferret";
  } else {
    const [accounts] = await db.select({ n: count() }).from(user);
    if (accounts && accounts.n > 0) {
      throw new MissingSecret(
        [
          "AUTH_SECRET isn't set, and this server already has accounts. Put the original back in Ferret's settings,",
          `or recover it from a key file (node dist/cli.js key recover /path/to/ferret-key-….json ${dataDir}).`,
          "If it's lost for good, make a new one on purpose — everyone is signed out, and two-step sign-in is turned off",
          "for the accounts that had it, to set up again:",
          "  node dist/cli.js secrets new AUTH_SECRET",
        ].join("\n"),
      );
    }
    next.AUTH_SECRET = out.AUTH_SECRET = newAuthSecret();
    sources.AUTH_SECRET = "ferret";
    made.push("AUTH_SECRET");
  }

  // Push keys: both from the settings, or both Ferret's.
  const pub = set(env.VAPID_PUBLIC_KEY);
  const priv = set(env.VAPID_PRIVATE_KEY);
  if (pub || priv) {
    if (pub) sources.VAPID_PUBLIC_KEY = "settings";
    if (priv) sources.VAPID_PRIVATE_KEY = "settings";
  } else if (stored.VAPID_PUBLIC_KEY && stored.VAPID_PRIVATE_KEY) {
    out.VAPID_PUBLIC_KEY = stored.VAPID_PUBLIC_KEY;
    out.VAPID_PRIVATE_KEY = stored.VAPID_PRIVATE_KEY;
    sources.VAPID_PUBLIC_KEY = sources.VAPID_PRIVATE_KEY = "ferret";
  } else {
    // Subscriptions made with other keys can't be sent to with these: devices turn push on again.
    await db.delete(pushSubscription);
    Object.assign(next, await newVapidKeys());
    out.VAPID_PUBLIC_KEY = next.VAPID_PUBLIC_KEY;
    out.VAPID_PRIVATE_KEY = next.VAPID_PRIVATE_KEY;
    sources.VAPID_PUBLIC_KEY = sources.VAPID_PRIVATE_KEY = "ferret";
    made.push("the push keys");
  }

  if (made.length) writeStoredSecrets(dataDir, next);
  return { env: out, sources, made };
}

/**
 * A new AUTH_SECRET, made on purpose (`cli.js secrets new AUTH_SECRET`) when the old one is lost: two-step sign-in
 * secrets sealed with the old one can't be read, so it's turned off for those accounts (they set it up again).
 * Returns how many accounts that was.
 */
export async function replaceAuthSecret(dataDir: string, db: Db) {
  const stored = readStoredSecrets(dataDir);
  const [had] = await db.select({ n: count() }).from(twoFactor);
  await db.delete(twoFactor);
  await db.update(user).set({ twoFactorEnabled: false });
  writeStoredSecrets(dataDir, { ...stored, AUTH_SECRET: newAuthSecret() });
  return had?.n ?? 0;
}
