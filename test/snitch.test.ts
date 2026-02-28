import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  buildPatterns,
  matchesBlocklist,
  evaluateToolCall,
  resolveConfig,
  DEFAULT_BLOCKLIST,
} from "../src/lib.ts";
import { installHooks, updateOpenclawConfig } from "../bin/postinstall.ts";

// --- buildPatterns ---

describe("buildPatterns", () => {
  it("matches exact term case-insensitively", () => {
    const p = buildPatterns(["clawhub"]);
    assert.ok(matchesBlocklist("clawhub", p));
    assert.ok(matchesBlocklist("CLAWHUB", p));
    assert.ok(matchesBlocklist("ClawHub", p));
  });

  it("respects word boundaries — does not match mid-word", () => {
    const p = buildPatterns(["clawhub"]);
    assert.ok(!matchesBlocklist("myclawhubstuff", p));
    assert.ok(!matchesBlocklist("clawhubbing", p));
  });

  it("matches term embedded in a sentence", () => {
    const p = buildPatterns(["clawhub"]);
    assert.ok(matchesBlocklist("please use clawhub now", p));
  });

  it("escapes regex special chars in term", () => {
    const p = buildPatterns(["evil.tool"]);
    assert.ok(matchesBlocklist("evil.tool", p));
    assert.ok(!matchesBlocklist("eviltool", p)); // dot is literal, not wildcard
  });
});

// --- evaluateToolCall ---

describe("evaluateToolCall — tool name matching", () => {
  const patterns = buildPatterns(DEFAULT_BLOCKLIST);

  it("blocks when tool name is exact match", () => {
    const result = evaluateToolCall("clawhub", {}, patterns);
    assert.deepEqual(result, { blocked: true, matchedIn: "toolName" });
  });

  it("does not block clean tool name", () => {
    const result = evaluateToolCall("read_file", {}, patterns);
    assert.deepEqual(result, { blocked: false });
  });

  it("blocks tool names with underscore suffix (clawhub_install)", () => {
    const result = evaluateToolCall("clawhub_install", {}, patterns);
    assert.deepEqual(result, { blocked: true, matchedIn: "toolName" });
  });

  it("blocks tool names with underscore prefix (_clawhub)", () => {
    const result = evaluateToolCall("_clawhub", {}, patterns);
    assert.deepEqual(result, { blocked: true, matchedIn: "toolName" });
  });

  it("blocks tool names with underscores on both sides (_clawhub_)", () => {
    const result = evaluateToolCall("_clawhub_", {}, patterns);
    assert.deepEqual(result, { blocked: true, matchedIn: "toolName" });
  });
});

describe("evaluateToolCall — params matching", () => {
  const patterns = buildPatterns(DEFAULT_BLOCKLIST);

  it("blocks when path param contains blocked term", () => {
    const result = evaluateToolCall("read_file", { path: "/tmp/clawhub-test.txt" }, patterns);
    assert.deepEqual(result, { blocked: true, matchedIn: "params" });
  });

  it("blocks when nested param contains blocked term", () => {
    const result = evaluateToolCall("write_file", { path: "/home/user/clawdhub/config" }, patterns);
    assert.deepEqual(result, { blocked: true, matchedIn: "params" });
  });

  it("does not block clean params", () => {
    const result = evaluateToolCall("read_file", { path: "/home/openclaw/.env" }, patterns);
    assert.deepEqual(result, { blocked: false });
  });

  it("does not block mid-word match in params", () => {
    // "clawhubbing" should not trigger word-boundary match
    const result = evaluateToolCall("read_file", { path: "/tmp/clawhubbing.txt" }, patterns);
    assert.deepEqual(result, { blocked: false });
  });
});

// --- resolveConfig ---

describe("resolveConfig", () => {
  it("uses defaults when given undefined", () => {
    const cfg = resolveConfig(undefined);
    assert.deepEqual(cfg.blocklist, DEFAULT_BLOCKLIST);
    assert.equal(cfg.alertTelegram, true);
    assert.equal(cfg.bootstrapDirective, true);
  });

  it("uses provided blocklist", () => {
    const cfg = resolveConfig({ blocklist: ["evil", "badtool"] });
    assert.deepEqual(cfg.blocklist, ["evil", "badtool"]);
  });

  it("falls back to defaults for non-array blocklist", () => {
    const cfg = resolveConfig({ blocklist: "not-an-array" as unknown as string[] });
    assert.deepEqual(cfg.blocklist, DEFAULT_BLOCKLIST);
  });

  it("respects alertTelegram: false", () => {
    const cfg = resolveConfig({ alertTelegram: false });
    assert.equal(cfg.alertTelegram, false);
  });

  it("respects bootstrapDirective: false", () => {
    const cfg = resolveConfig({ bootstrapDirective: false });
    assert.equal(cfg.bootstrapDirective, false);
  });
});

// --- installHooks ---

describe("installHooks", () => {
  let tmpDir: string;
  let srcHooksDir: string;
  let targetHooksDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "snitch-test-"));
    srcHooksDir = path.join(tmpDir, "source-hooks");
    targetHooksDir = path.join(tmpDir, "target-hooks");

    // Create fake source hook dirs
    fs.mkdirSync(path.join(srcHooksDir, "snitch-bootstrap"), { recursive: true });
    fs.writeFileSync(path.join(srcHooksDir, "snitch-bootstrap", "handler.ts"), "// bootstrap");
    fs.writeFileSync(path.join(srcHooksDir, "snitch-bootstrap", "HOOK.md"), "# Bootstrap");

    fs.mkdirSync(path.join(srcHooksDir, "snitch-message-guard"), { recursive: true });
    fs.writeFileSync(path.join(srcHooksDir, "snitch-message-guard", "handler.ts"), "// guard");
    fs.writeFileSync(path.join(srcHooksDir, "snitch-message-guard", "HOOK.md"), "# Guard");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("copies hook directories to target", () => {
    const result = installHooks(srcHooksDir, targetHooksDir);
    assert.equal(result.success, true);
    assert.ok(fs.existsSync(path.join(targetHooksDir, "snitch-bootstrap", "handler.ts")));
    assert.ok(fs.existsSync(path.join(targetHooksDir, "snitch-message-guard", "handler.ts")));
    assert.equal(
      fs.readFileSync(path.join(targetHooksDir, "snitch-bootstrap", "handler.ts"), "utf8"),
      "// bootstrap",
    );
  });

  it("creates target hooks dir if it doesn't exist", () => {
    assert.ok(!fs.existsSync(targetHooksDir));
    installHooks(srcHooksDir, targetHooksDir);
    assert.ok(fs.existsSync(targetHooksDir));
  });

  it("overwrites existing hooks on reinstall", () => {
    fs.mkdirSync(path.join(targetHooksDir, "snitch-bootstrap"), { recursive: true });
    fs.writeFileSync(path.join(targetHooksDir, "snitch-bootstrap", "handler.ts"), "// old");

    installHooks(srcHooksDir, targetHooksDir);
    assert.equal(
      fs.readFileSync(path.join(targetHooksDir, "snitch-bootstrap", "handler.ts"), "utf8"),
      "// bootstrap",
    );
  });

  it("returns installed hook names", () => {
    const result = installHooks(srcHooksDir, targetHooksDir);
    assert.deepEqual(result.installed.sort(), ["snitch-bootstrap", "snitch-message-guard"]);
  });

  it("fails gracefully when source dir missing", () => {
    const result = installHooks("/nonexistent/hooks", targetHooksDir);
    assert.equal(result.success, false);
    assert.ok(result.error);
  });
});

// --- updateOpenclawConfig ---

describe("updateOpenclawConfig", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "snitch-cfg-"));
    configPath = path.join(tmpDir, "openclaw.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates openclaw.json with hooks enabled, no plugins section", () => {
    updateOpenclawConfig(configPath);
    assert.ok(fs.existsSync(configPath));
    const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(cfg.hooks.internal.enabled, true);
    assert.equal(cfg.hooks.internal.entries["snitch-bootstrap"].enabled, true);
    assert.equal(cfg.hooks.internal.entries["snitch-message-guard"].enabled, true);
    assert.equal(cfg.plugins, undefined);
  });

  it("merges into existing config without clobbering", () => {
    fs.writeFileSync(configPath, JSON.stringify({
      hooks: {
        internal: {
          enabled: true,
          entries: {
            "my-other-hook": { enabled: true },
          },
        },
      },
      plugins: {
        allow: ["some-other-plugin", "telegram"],
        entries: { telegram: { enabled: true } },
        installs: { telegram: { source: "npm" } },
      },
      somethingElse: 42,
    }, null, 2));

    updateOpenclawConfig(configPath);
    const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));

    // Existing entries preserved
    assert.equal(cfg.hooks.internal.entries["my-other-hook"].enabled, true);
    assert.equal(cfg.somethingElse, 42);
    assert.deepEqual(cfg.plugins.allow, ["some-other-plugin", "telegram"]);
    assert.equal(cfg.plugins.installs.telegram.source, "npm");

    // New entries added
    assert.equal(cfg.hooks.internal.entries["snitch-bootstrap"].enabled, true);
    assert.equal(cfg.hooks.internal.entries["snitch-message-guard"].enabled, true);
  });
});

// --- snitch-bootstrap handler ---

describe("snitch-bootstrap handler", () => {
  it("injects bootstrap file with required path and missing fields", async () => {
    const handler = (await import("../hooks/snitch-bootstrap/handler.ts")).default;
    const bootstrapFiles: Array<Record<string, unknown>> = [];
    const event = {
      type: "agent",
      action: "bootstrap",
      context: { bootstrapFiles },
    };

    await handler(event);

    assert.equal(bootstrapFiles.length, 1);
    const file = bootstrapFiles[0];
    assert.equal(file.name, "SECURITY-SNITCH-BLOCK.md");
    assert.equal(typeof file.path, "string");
    assert.ok((file.path as string).length > 0, "path must be non-empty");
    assert.equal(file.missing, false);
    assert.equal(typeof file.content, "string");
    assert.ok((file.content as string).includes("BLOCKED TOOLS"));
  });

  it("does not inject when event type/action mismatch", async () => {
    const handler = (await import("../hooks/snitch-bootstrap/handler.ts")).default;
    const bootstrapFiles: Array<Record<string, unknown>> = [];

    await handler({ type: "agent", action: "other", context: { bootstrapFiles } });
    assert.equal(bootstrapFiles.length, 0);

    await handler({ type: "message", action: "bootstrap", context: { bootstrapFiles } });
    assert.equal(bootstrapFiles.length, 0);
  });
});

// --- postinstall banner ---

describe("postinstall banner", () => {
  it("uses plugins.entries schema, not plugins.config", () => {
    const src = fs.readFileSync(
      new URL("../bin/postinstall.ts", import.meta.url),
      "utf8",
    );
    assert.ok(!src.includes('"plugins.config.'), 'banner must not reference old plugins.config schema');
    assert.ok(src.includes('"plugins"'), 'banner should reference plugins key');
    assert.ok(src.includes('"entries"'), 'banner should use entries schema');
  });
});
