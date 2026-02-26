# openclaw-snitch

## Project Overview

A small, focused OpenClaw plugin. Keep it that way — this is a security guard, not a framework. Fight scope creep hard.

**Rule of thumb:** if you're adding a file that isn't `src/`, `hooks/`, `bin/`, `test/`, or a root doc — stop and ask.

## TDD is Required

All changes follow Red → Green → Commit. No exceptions.

1. Write the failing test first
2. Run it — verify it fails for the right reason
3. Write the minimal implementation to make it pass
4. Run the tests — verify they pass
5. Commit

Run tests with:
```bash
npm test
```

## Code Style

- TypeScript, ESM, Node 24 (`--experimental-strip-types`, no build step)
- 2-space indent
- No external runtime deps beyond `openclaw/plugin-sdk`
- Hook handlers: zero imports (Node 24 type stripping only)
- Shared logic lives in `src/lib.ts` — both plugin and CLI import from there

## Known Issues / Gotchas

- `\b` word boundaries don't split on `_` — "clawhub_install" is one token and won't match. See test: "known gap: underscore-joined tool names are NOT matched by word boundary". Fix is pending.
- Hook handlers duplicate some logic from `src/lib.ts` because hooks can't import across packages at runtime without a build step. That's intentional — keep hooks self-contained.

## Testing

- Test file: `test/snitch.test.ts`
- CLI tool: `bin/snitch-check.ts` — use this for manual spot-checking during dev
- All new behavior needs a test. All bug fixes need a regression test first.

## File Budget

Think before adding files. Current structure:
```
src/lib.ts          — shared core logic
src/index.ts        — plugin entry point
hooks/*/handler.ts  — hook handlers (self-contained)
test/snitch.test.ts — test suite
bin/snitch-check.ts — dev/debug CLI
```
