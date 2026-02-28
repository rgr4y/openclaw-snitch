# TDD Setup & Word Boundary Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the underscore word-boundary gap in `buildPatterns` so tool names like `clawhub_install` are caught, following strict TDD.

**Architecture:** The fix lives entirely in `src/lib.ts` — replace the `\b` anchors with a pattern that also treats `_` as a boundary. The regex change propagates to the plugin and CLI automatically since they import from lib.

**Tech Stack:** TypeScript, Node 24 `node:test`, `--experimental-strip-types`

---

### Task 1: Write the failing regression test

**Files:**
- Modify: `test/snitch.test.ts`

**Step 1: Change the "known gap" test to assert the CORRECT behavior (it should block)**

Find this test in `test/snitch.test.ts`:

```typescript
it("known gap: underscore-joined tool names are NOT matched by word boundary", () => {
  const result = evaluateToolCall("clawhub_install", {}, patterns);
  assert.deepEqual(result, { blocked: false }); // documents current behavior
});
```

Replace with:

```typescript
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
```

**Step 2: Run tests — verify new tests fail**

```bash
npm test 2>&1 | grep -E "pass|fail|not ok"
```

Expected: 3 new failures, rest pass.

---

### Task 2: Fix buildPatterns in src/lib.ts

**Files:**
- Modify: `src/lib.ts`

**Step 1: Replace `\b` anchors with underscore-aware boundaries**

Find in `src/lib.ts`:

```typescript
export function buildPatterns(blocklist: string[]): RegExp[] {
  return blocklist.map(
    (term) =>
      new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
  );
}
```

Replace with:

```typescript
export function buildPatterns(blocklist: string[]): RegExp[] {
  return blocklist.map((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // \b doesn't split on underscores — use a lookahead/lookbehind that treats
    // both non-word chars AND underscores as boundaries.
    return new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "i");
  });
}
```

Wait — that still won't split `clawhub_install` since `_` is `\w`. Use explicit boundary:

```typescript
export function buildPatterns(blocklist: string[]): RegExp[] {
  return blocklist.map((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match term at start/end of string or bordered by non-alphanumeric chars.
    // This catches clawhub, clawhub_install, _clawhub, CLAWHUB etc.
    return new RegExp(`(?:^|[^a-zA-Z0-9])${escaped}(?:[^a-zA-Z0-9]|$)`, "i");
  });
}
```

**Step 2: Run tests**

```bash
npm test 2>&1 | grep -E "pass|fail|not ok"
```

Expected: all 16+ pass.

**Step 3: Spot-check with CLI**

```bash
node --experimental-strip-types bin/snitch-check.ts clawhub_install
node --experimental-strip-types bin/snitch-check.ts read_file '{"path":"/tmp/clawhub_stuff.txt"}'
node --experimental-strip-types bin/snitch-check.ts read_file '{"path":"/tmp/notblocked.txt"}'
```

Expected: first two BLOCKED, third ALLOWED.

**Step 4: Commit**

```bash
cd /Users/rob/workspace/superpack-snitch
sleep 1 && git add src/lib.ts test/snitch.test.ts
git commit -m "fix: treat underscore as word boundary in buildPatterns"
```

---

### Task 3: Sync fix to hook handlers

**Files:**
- Modify: `hooks/snitch-message-guard/handler.ts`

The hooks duplicate `buildPatterns` since they can't import from lib at runtime. Update the copy.

**Step 1: Find the duplicate in hooks/snitch-message-guard/handler.ts**

```typescript
function buildPatterns(blocklist: string[]): RegExp[] {
  return blocklist.map(
    (term: string) =>
      new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
  );
}
```

Replace with the same fix:

```typescript
function buildPatterns(blocklist: string[]): RegExp[] {
  return blocklist.map((term: string) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-zA-Z0-9])${escaped}(?:[^a-zA-Z0-9]|$)`, "i");
  });
}
```

**Step 2: Run tests (no regression)**

```bash
npm test 2>&1 | grep -E "pass|fail"
```

**Step 3: Commit**

```bash
sleep 1 && git add hooks/snitch-message-guard/handler.ts
git commit -m "fix: sync boundary fix to message-guard hook"
```
