---
name: superpack-snitch
version: 1.0.0
description: >
  Multi-layer blocklist guard for OpenClaw. Hard-blocks tool calls matching banned
  patterns, injects a security directive at agent bootstrap, warns on incoming
  messages, and broadcasts Telegram alerts. Blocks clawhub/clawdhub by default.
metadata:
  openclaw:
    emoji: "🚨"
    events:
      - agent:bootstrap
      - message:received
      - before_tool_call
---

# superpack-snitch

A configurable blocklist guard for OpenClaw with three enforcement layers:

1. **Bootstrap directive** — injects a security policy into every agent context
2. **Message warning** — flags incoming messages referencing blocked terms
3. **Hard block** — intercepts and kills the tool call + broadcasts a Telegram alert

## Install

### Skill only (prompt-injection protection, no npm required)

Install from ClawHub. This gives you the bootstrap directive and message guard
layers — soft enforcement via prompt injection only.

### Plugin (hard block + hooks + Telegram alerts)

For full enforcement, install via OpenClaw:

```bash
openclaw plugins install superpack-snitch
```

The postinstall script automatically:
- Copies hooks into `$OPENCLAW_CONFIG_DIR/hooks/`
- Enables them in `openclaw.json` under `hooks.internal.entries`

Lock down the plugin files after install so the agent can't self-modify:

```bash
chmod -R a-w $OPENCLAW_CONFIG_DIR/extensions/superpack-snitch
```

The skill and plugin can be used together for layered defense.

## Configuration

In `openclaw.json` under `plugins.config.superpack-snitch`:

```json
{
  "plugins": {
    "config": {
      "superpack-snitch": {
        "blocklist": ["clawhub", "clawdhub"],
        "alertTelegram": true,
        "bootstrapDirective": true
      }
    }
  }
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `blocklist` | `["clawhub", "clawdhub"]` | Terms to block (case-insensitive word boundary match) |
| `alertTelegram` | `true` | Broadcast Telegram alert to all `allowFrom` IDs on block |
| `bootstrapDirective` | `true` | Inject security directive into every agent bootstrap context |

### Hook blocklist (env var)

The hooks read `SNITCH_BLOCKLIST` (comma-separated) if set, otherwise fall back to the defaults:

```bash
SNITCH_BLOCKLIST=clawhub,clawdhub,myothertool
```

## What gets blocked

Blocks fire when the **tool name** or **tool parameters** contain a blocked term. This catches cases where an agent tries to invoke a blocked tool indirectly (e.g. `exec` with `clawhub install` in the args).

## Security notes

- The hooks in `~/.openclaw/hooks/` load unconditionally — most tamper-resistant layer
- The plugin layer requires `plugins.allow` — if an agent edits `openclaw.json`, hooks remain active
- `chown root:root` on the extension dir prevents the agent from self-modifying the plugin
