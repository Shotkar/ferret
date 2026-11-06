import type { BackupStatus } from "@ferret/shared";
import { describe, expect, it } from "vitest";
import { masterKeyId, otherMasterKeys } from "../src/lib/files";
import { openKeyFile, passphraseProblem, sealKeyFile } from "../src/lib/key-file";
import { KEY_FILE_JOB, keyFileNotice, lastKeyFile, recordKeyFile } from "../src/lib/key-file-log";
import { job } from "../src/db/schema";
import { FakeNotifier, config, setup } from "./helpers";

const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;

const otherKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const passphrase = "correct horse battery staple";
// Far fewer rounds than a real key file, so the tests stay quick; the format is the same.
const quick = { iterations: 1000 };
const secrets = { FILES_KEY: config.FILES_KEY, AUTH_SECRET: config.AUTH_SECRET, VAPID_PUBLIC_KEY: "BPub", VAPID_PRIVATE_KEY: "priv" };

describe("key files", () => {
  it("give every secret back with the passphrase, and name which FILES_KEY they hold", async () => {
    const file = await sealKeyFile(secrets, passphrase, quick);
    expect(file).toMatchObject({ format: "ferret-key", version: 1, keyId: await masterKeyId(config.FILES_KEY) });
    expect(JSON.stringify(file)).not.toContain(config.FILES_KEY);
    expect(JSON.stringify(file)).not.toContain(config.AUTH_SECRET);
    expect(await openKeyFile(JSON.parse(JSON.stringify(file)), passphrase)).toEqual(secrets);
  });

  it("hold only what the server has", async () => {
    const file = await sealKeyFile({ FILES_KEY: config.FILES_KEY }, passphrase, quick);
    expect(await openKeyFile(file, passphrase)).toEqual({ FILES_KEY: config.FILES_KEY });
  });

  it("are made with PBKDF2's full rounds unless told otherwise", async () => {
    const file = await sealKeyFile(secrets, passphrase);
    expect(file.kdf.iterations).toBe(600_000);
  });

  it("refuse a wrong passphrase", async () => {
    const file = await sealKeyFile(secrets, passphrase, quick);
    await expect(openKeyFile(file, "correct horse battery stapler")).rejects.toThrow(/Wrong passphrase/);
  });

  it("can't be passed off as another key's", async () => {
    const file = await sealKeyFile(secrets, passphrase, quick);
    await expect(openKeyFile({ ...file, keyId: await masterKeyId(otherKey) }, passphrase)).rejects.toThrow(/Wrong passphrase/);
  });

  it("say plainly what's wrong with something that isn't one", async () => {
    await expect(openKeyFile({ hello: 1 }, passphrase)).rejects.toThrow(/isn't a Ferret key file/);
    await expect(openKeyFile({ format: "ferret-key", version: 2 }, passphrase)).rejects.toThrow(/version 2/);
    await expect(openKeyFile({ format: "ferret-key", version: 1, keyId: "x" }, passphrase)).rejects.toThrow(/damaged/);
  });

  it("need a long passphrase", async () => {
    expect(passphraseProblem("hunter2")).toMatch(/at least 16/);
    expect(passphraseProblem(passphrase)).toBeUndefined();
    await expect(sealKeyFile(secrets, "short", quick)).rejects.toThrow(/at least 16/);
  });
});

describe("the files key check at start", () => {
  it("passes a fresh server, and the right key once files are sealed", async () => {
    const t = await setup();
    expect((await otherMasterKeys(t.db, config.FILES_KEY)).needed).toEqual([]);
    const ann = await t.user("ann");
    await t.files.seal(ann.householdId, "test", "something secret");
    expect(await otherMasterKeys(t.db, config.FILES_KEY)).toEqual({ set: await masterKeyId(config.FILES_KEY), needed: [] });
  });

  it("names the key the files need when another one is set", async () => {
    const t = await setup();
    const ann = await t.user("ann");
    await t.files.seal(ann.householdId, "test", "something secret");
    expect(await otherMasterKeys(t.db, otherKey)).toEqual({ set: await masterKeyId(otherKey), needed: [await masterKeyId(config.FILES_KEY)] });
  });

  it("shows the server admin the fingerprint, never the key", async () => {
    const t = await setup();
    const ann = await t.user("ann");
    const status = await json<BackupStatus>(ann.as("/api/v1/backup"));
    expect(status.keyId).toBe(await masterKeyId(config.FILES_KEY));
    expect(JSON.stringify(status)).not.toContain(config.FILES_KEY);
  });
});

describe("making a key file", () => {
  it("is recorded, shown in Settings → Server, and told to the server admin", async () => {
    const t = await setup();
    const ann = await t.user("ann"); // the first account: the server admin
    const keyId = await masterKeyId(config.FILES_KEY);
    expect((await json<BackupStatus>(ann.as("/api/v1/backup"))).keyFile).toBeNull();

    const record = { at: "2026-11-05T20:00:00.000Z", keyId, where: "/backups/ferret-key.json" };
    const queued: { type: string; payload: unknown }[] = [];
    await recordKeyFile(t.db, { enqueue: async (type, payload) => void queued.push({ type, payload }) }, record);
    expect(queued).toEqual([{ type: KEY_FILE_JOB, payload: record }]);
    expect((await json<BackupStatus>(ann.as("/api/v1/backup"))).keyFile).toEqual({ ...record, current: true });

    const notifier = new FakeNotifier();
    await keyFileNotice({ ...t.deps, notifier, files: t.files, appUrl: config.PUBLIC_URL, mailUrl: "mailtos://x:y@mail.example.com" })(record, { lastAttempt: true });
    expect(notifier.sent).toEqual([
      expect.objectContaining({
        url: expect.stringContaining("to=ann%40example.com"),
        title: "A key file was made for Ferret's files",
        body: expect.stringContaining(`FILES_KEY ${keyId}`),
      }),
    ]);
  });

  it("says when the newest key file holds another key", async () => {
    const t = await setup();
    await recordKeyFile(t.db, { enqueue: async () => {} }, { at: "2026-11-01T00:00:00.000Z", keyId: await masterKeyId(otherKey), where: "/backups/old.json" });
    expect(await lastKeyFile(t.db, await masterKeyId(config.FILES_KEY))).toMatchObject({ current: false });
  });

  it("queues the notice as a job the server runs", async () => {
    const t = await setup();
    await recordKeyFile(t.db, t.jobs, { at: "2026-11-05T20:00:00.000Z", keyId: "abc", where: "/data/k.json" });
    const rows = await t.db.select().from(job);
    expect(rows.map((r) => r.type)).toContain(KEY_FILE_JOB);
  });
});
