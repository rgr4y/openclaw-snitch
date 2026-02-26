import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPatterns,
  matchesBlocklist,
  evaluateToolCall,
  resolveConfig,
  DEFAULT_BLOCKLIST,
} from "../src/lib.ts";

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
