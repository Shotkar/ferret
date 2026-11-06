import { describe, expect, it } from "vitest";
import { loadConfig, sameOrigin } from "../src/config";
import { setup } from "./helpers";

const base = { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret-123", FILES_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(9))) };

describe("PUBLIC_URL", () => {
  it("is known to be unset when it's missing or empty", () => {
    expect(loadConfig(base).publicUrlSet).toBe(false);
    expect(loadConfig({ ...base, PUBLIC_URL: "" }).publicUrlSet).toBe(false);
    expect(loadConfig({ ...base, PUBLIC_URL: "https://ferret.example.com" }).publicUrlSet).toBe(true);
  });
});

describe("a request's own origin", () => {
  const req = (headers: Record<string, string>) => new Request("http://192.168.1.10:8787/api/auth/sign-up/email", { method: "POST", headers });

  it("is the page's when the browser says so, or the Origin's host is the one asked", () => {
    expect(sameOrigin(req({ origin: "https://umbrel.local:8785", "sec-fetch-site": "same-origin" }))).toEqual(["https://umbrel.local:8785"]);
    expect(sameOrigin(req({ origin: "http://nas:8787", host: "nas:8787" }))).toEqual(["http://nas:8787"]);
    expect(sameOrigin(req({ origin: "http://192.168.1.10:8787", host: "192.168.1.10:8787" }))).toEqual(["http://192.168.1.10:8787"]);
  });

  it("is never another site's", () => {
    expect(sameOrigin(req({ origin: "https://attacker.com", host: "192.168.1.10:8787" }))).toEqual([]);
    expect(sameOrigin(req({ origin: "https://attacker.com", host: "192.168.1.10:8787", "sec-fetch-site": "cross-site" }))).toEqual([]);
    expect(sameOrigin(req({ origin: "null", host: "192.168.1.10:8787" }))).toEqual([]);
    expect(sameOrigin(req({ host: "192.168.1.10:8787" }))).toEqual([]);
    expect(sameOrigin(undefined)).toEqual([]);
  });

  it("is never a public name, which DNS rebinding could point at this server", () => {
    expect(sameOrigin(req({ origin: "https://attacker.com", host: "attacker.com" }))).toEqual([]);
    expect(sameOrigin(req({ origin: "https://attacker.com", host: "attacker.com", "sec-fetch-site": "same-origin" }))).toEqual([]);
    expect(sameOrigin(req({ origin: "https://ferret.example.org", "sec-fetch-site": "same-origin" }))).toEqual([]);
  });
});

describe("signing up from the address Ferret is opened at", () => {
  const signUp = (t: Awaited<ReturnType<typeof setup>>, origin: string, host: string) =>
    t.app.request(`http://${host}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin, Host: host },
      body: JSON.stringify({ email: `p${Math.random().toString(36).slice(2)}@example.com`, password: "correct-horse-battery", name: "P" }),
    });

  it("works without PUBLIC_URL (a one-click install), but not from another site", async () => {
    const t = await setup({ config: { publicUrlSet: false } });
    expect((await signUp(t, "http://192.168.1.10:8787", "192.168.1.10:8787")).status).toBe(200);
    expect((await signUp(t, "https://attacker.com", "192.168.1.10:8787")).status).toBe(403);
  });

  // With PUBLIC_URL set, Better Auth trusts it alone — but it doesn't apply that check the same way under NODE_ENV=test,
  // so that case was checked against a production build (sign-up from the LAN address: 403 INVALID_ORIGIN).

  it("is reported to the server admin, so they set it", async () => {
    const t = await setup({ config: { publicUrlSet: false } });
    const ann = await t.user("ann");
    expect(await (await ann.as("/api/v1/server/address")).json()).toEqual({ set: false, publicUrl: t.config.PUBLIC_URL });
  });
});
