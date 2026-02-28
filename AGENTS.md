# superpack-snitch — Agent Notes

## Running Tests

Always use the Terminal popup pattern for test runs — opens a window, runs, auto-closes 30s after completion:

```bash
osascript <<'EOF'
tell application "Terminal"
  activate
  set w to do script "cd /Users/rob/workspace/superpack-snitch && npm test; echo ''; echo '--- done, closing in 30s ---'; sleep 30; osascript -e 'tell application \"Terminal\" to close (every window whose name contains \"snitch\")'"
  set custom title of w to "snitch tests"
end tell
EOF
```

Direct (no popup):
```bash
cd ~/workspace/superpack-snitch && npm test
```

## TDD Workflow

Red → Green → Commit. See `.claude/CLAUDE.md` for full rules.

## Key Files

```
src/lib.ts          — shared core logic (buildPatterns, evaluateToolCall, etc.)
src/index.ts        — plugin entry point (imports from lib.ts)
hooks/*/handler.ts  — self-contained hook handlers (no imports)
test/snitch.test.ts — test suite (node:test, no deps)
bin/snitch-check.ts — dev CLI for manual spot-checking
```

## Known Gotchas

- Hook handlers duplicate `buildPatterns` from `src/lib.ts` — they can't import at runtime without a build step. When changing pattern logic, sync both places.
- Commit with `sleep 1` before `git commit` or the lock will fail.
