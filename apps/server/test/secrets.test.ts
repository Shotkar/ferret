import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MissingSecret, SECRETS_FILE, readStoredSecrets, replaceAuthSecret, resolveSecrets } from "../src/adapters/local/secrets";
import { loadConfig } from "../src/config";
import { pushSubscription, twoFactor, user } from "../src/db/schema";
import { WebCryptoPush } from "../src/lib/web-push";
import { setup } from "./helpers";

const folder = () => mkdtempSync(path.join(tmpdir(), "ferret-secrets-"));

describe("secrets Ferret makes", () => {
  it("are made the first time, kept readable by Ferret alone, and the same on every start after", async () => {
    const { db } = await setup();
    const dataDir = folder();
    const first = await resolveSecrets({ dataDir, env: {}, db });
    expect(first.made).toEqual(["FILES_KEY", "AUTH_SECRET", "the push keys"]);
    expect(first.sources).toEqual({ FILES_KEY: "ferret", AUTH_SECRET: "ferret", VAPID_PUBLIC_KEY: "ferret", VAPID_PRIVATE_KEY: "ferret" });
    expect(statSync(path.join(dataDir, SECRETS_FILE)).mode & 0o777).toBe(0o600);

    // The right shapes: the config takes them, and the push keys are a real P-256 pair.
    const config = loadConfig({ NODE_ENV: "test", ...first.env });
    await expect((new WebCryptoPush(config.VAPID_PUBLIC_KEY!, config.VAPID_PRIVATE_KEY!, "mailto:a@example.org") as unknown as { key: Promise<unknown> }).key).resolves.toBeTruthy();

    const again = await resolveSecrets({ dataDir, env: {}, db });
    expect(again.made).toEqual([]);
    for (const name of ["FILES_KEY", "AUTH_SECRET", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]) expect(again.env[name]).toBe(first.env[name]);
  });

  it("give way to the settings, which are never written to the file", async () => {
    const { db } = await setup();
    const dataDir = folder();
    const own = { AUTH_SECRET: "a".repeat(40), FILES_KEY: btoa("k".repeat(32)) };
    const r = await resolveSecrets({ dataDir, env: { ...own, VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: " " }, db });
    expect(r.sources).toMatchObject({ AUTH_SECRET: "settings", FILES_KEY: "settings", VAPID_PUBLIC_KEY: "ferret" });
    expect(r.env).toMatchObject(own);
    const file = readFileSync(path.join(dataDir, SECRETS_FILE), "utf8");
    expect(file).not.toContain(own.AUTH_SECRET);
    expect(readStoredSecrets(dataDir)).not.toHaveProperty("FILES_KEY");
  });

  it("never make a new FILES_KEY once files are sealed: Ferret stops and says how to bring it back", async () => {
    const t = await setup();
    const ann = await t.user("ann");
    await t.files.seal(ann.householdId, "test", "secret");
    await expect(resolveSecrets({ dataDir: folder(), env: { AUTH_SECRET: "a".repeat(40) }, db: t.db })).rejects.toThrow(MissingSecret);
    await expect(resolveSecrets({ dataDir: folder(), env: { AUTH_SECRET: "a".repeat(40) }, db: t.db })).rejects.toThrow(/key recover/);
  });

  it("never swap AUTH_SECRET by themselves once there are accounts", async () => {
    const t = await setup();
    await t.user("ann");
    await expect(resolveSecrets({ dataDir: folder(), env: { FILES_KEY: btoa("k".repeat(32)) }, db: t.db })).rejects.toThrow(/secrets new AUTH_SECRET/);
  });

  it("remake lost push keys by themselves, dropping subscriptions the new ones can't reach", async () => {
    const t = await setup();
    const ann = await t.user("ann");
    const [u] = await t.db.select({ id: user.id }).from(user);
    await t.db.insert(pushSubscription).values({ householdId: ann.householdId, userId: u!.id, endpoint: "https://push.example/1", p256dh: "x", auth: "y" } as never);
    const r = await resolveSecrets({ dataDir: folder(), env: { FILES_KEY: btoa("k".repeat(32)), AUTH_SECRET: "a".repeat(40) }, db: t.db });
    expect(r.made).toEqual(["the push keys"]);
    expect(await t.db.select().from(pushSubscription)).toEqual([]);
  });

  it("refuse a secrets file that isn't one, rather than make new secrets over it", async () => {
    const { db } = await setup();
    const dataDir = folder();
    writeFileSync(path.join(dataDir, SECRETS_FILE), "not json");
    await expect(resolveSecrets({ dataDir, env: {}, db })).rejects.toThrow(/isn't readable JSON/);
  });

  it("a new AUTH_SECRET on purpose turns two-step sign-in off, to set up again", async () => {
    const t = await setup();
    await t.user("ann");
    const [u] = await t.db.select({ id: user.id }).from(user);
    const dataDir = folder();
    await resolveSecrets({ dataDir, env: {}, db: (await setup()).db });
    const before = readStoredSecrets(dataDir);
    await t.db.insert(twoFactor).values({ id: "tf1", userId: u!.id, secret: "sealed", backupCodes: "sealed" } as never);
    await t.db.update(user).set({ twoFactorEnabled: true });
    expect(await replaceAuthSecret(dataDir, t.db)).toBe(1);
    const after = readStoredSecrets(dataDir);
    expect(after.AUTH_SECRET).not.toBe(before.AUTH_SECRET);
    expect(after.FILES_KEY).toBe(before.FILES_KEY);
    expect(await t.db.select().from(twoFactor)).toEqual([]);
  });
});

describe("Settings → Server's keys", () => {
  const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;

  it("say where each secret came from, and give only the push public key", async () => {
    const { FakePush } = await import("./helpers");
    const t = await setup({
      push: new FakePush(),
      config: { VAPID_PUBLIC_KEY: "BFakePublicKey", VAPID_PRIVATE_KEY: "private" },
      secrets: { sources: { FILES_KEY: "ferret", AUTH_SECRET: "settings", VAPID_PUBLIC_KEY: "ferret", VAPID_PRIVATE_KEY: "ferret" }, file: "/data/secrets.json", filesKeyId: "abc" },
    });
    const ann = await t.user("ann");
    const body = await json<Record<string, unknown>>(ann.as("/api/v1/server/secrets"));
    expect(body).toEqual({
      file: "/data/secrets.json",
      secrets: [
        { name: "FILES_KEY", source: "ferret" },
        { name: "AUTH_SECRET", source: "settings" },
        { name: "VAPID_PUBLIC_KEY", source: "ferret" },
        { name: "VAPID_PRIVATE_KEY", source: "ferret" },
      ],
      pushPublicKey: "BFakePublicKey",
    });
    expect(JSON.stringify(body)).not.toContain("private");
    expect(JSON.stringify(body)).not.toContain(t.config.AUTH_SECRET);
  });

  it("are the server admin's only", async () => {
    const t = await setup();
    await t.user("ann");
    const bob = await t.user("bob");
    expect((await bob.as("/api/v1/server/secrets")).status).toBe(403);
  });

  it("remind the server admin to save FILES_KEY while it's only in the data folder", async () => {
    const { masterKeyId } = await import("../src/lib/files");
    const { recordKeyFile } = await import("../src/lib/key-file-log");
    const filesKeyId = await masterKeyId((await import("./helpers")).config.FILES_KEY);
    const t = await setup({ secrets: { sources: { FILES_KEY: "ferret" }, file: "/data/secrets.json", filesKeyId } });
    const ann = await t.user("ann");
    const bell = async () => (await json<{ data: { id: string }[] }>(ann.as("/api/v1/attention"))).data.map((a) => a.id);
    expect(await bell()).toContain(`backup:key-file:${filesKeyId}`);
    await recordKeyFile(t.db, { enqueue: async () => {} }, { at: new Date().toISOString(), keyId: filesKeyId, where: "/backups/k.json" });
    expect(await bell()).not.toContain(`backup:key-file:${filesKeyId}`);
  });
});
