import { describe, expect, it } from "vitest";
import { doclingOptions, loadConfig, vapidSubject, vapidSubjectProblem } from "../src/config";

const base = { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret-123", FILES_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(9))) };

describe("docling options", () => {
  it("are docling's own defaults unless a VLM endpoint or options are given", () => {
    expect(doclingOptions(loadConfig(base))).toEqual({});
  });

  it("use the VLM pipeline at DOCLING_VLM_URL", () => {
    const options = doclingOptions(loadConfig({ ...base, DOCLING_VLM_URL: "http://gpu.example:8001/v1/chat/completions" }));
    expect(options.pipeline).toBe("vlm");
    expect(JSON.parse(options.vlm_pipeline_model_api!)).toMatchObject({ url: "http://gpu.example:8001/v1/chat/completions", params: { model: "granite-docling" } });
  });

  it("take DOCLING_OPTIONS over both, object values as JSON", () => {
    const config = loadConfig({ ...base, DOCLING_VLM_URL: "http://gpu.example:8001/v1/chat/completions", DOCLING_OPTIONS: '{"pipeline":"standard","ocr":{"lang":"en"}}' });
    expect(doclingOptions(config)).toEqual({ pipeline: "standard", ocr: '{"lang":"en"}' });
  });

  it("refuse DOCLING_OPTIONS that isn't JSON", () => {
    expect(() => loadConfig({ ...base, DOCLING_OPTIONS: "pipeline=vlm" })).toThrow(/DOCLING_OPTIONS/);
  });
});

describe("Web Push's contact", () => {
  it("is admin@ the public host unless VAPID_SUBJECT says otherwise", () => {
    expect(vapidSubject(loadConfig({ ...base, PUBLIC_URL: "https://ferret.example.com" }))).toBe("mailto:admin@ferret.example.com");
    expect(vapidSubject(loadConfig({ ...base, VAPID_SUBJECT: "mailto:me@example.org" }))).toBe("mailto:me@example.org");
  });

  it("is checked for what Apple's push service refuses: no public domain", () => {
    for (const bad of ["https://ferret.lan", "mailto:admin@ferret.lan", "mailto:admin@localhost", "https://10.0.0.2", "https://nas", "https://ferret.home.arpa", "ferret.example.com", "http://ferret.example.org"]) {
      expect(vapidSubjectProblem(bad), bad).toBeTruthy();
    }
    for (const good of ["mailto:me@example.org", "https://ferret.example.org", "mailto:noreply@ferret.app"]) {
      expect(vapidSubjectProblem(good), good).toBeUndefined();
    }
  });
});

describe("empty settings", () => {
  it("count as unset, as Unraid's template and `KEY=` lines in .env pass them", () => {
    const config = loadConfig({ ...base, OLLAMA_URL: "", APPRISE_URL: " ", TRUSTED_PROXIES: "", OIDC_NAME: "", BACKUP_DIR: "" });
    expect(config.OLLAMA_URL).toBeUndefined();
    expect(config.APPRISE_URL).toBeUndefined();
    expect(config.BACKUP_DIR).toBeUndefined();
    expect(config.TRUSTED_PROXIES).toBe("127.0.0.1,::1");
    expect(config.OIDC_NAME).toBe("single sign-on");
  });

  it("except CHAT_REASONING, where empty leaves reasoning_effort out", () => {
    expect(loadConfig({ ...base, CHAT_REASONING: "" }).CHAT_REASONING).toBe("");
    expect(loadConfig(base).CHAT_REASONING).toBe("low");
  });

  it("still leave a required one missing", () => {
    expect(() => loadConfig({ ...base, AUTH_SECRET: "" })).toThrow(/AUTH_SECRET/);
  });
});
