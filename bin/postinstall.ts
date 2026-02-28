#!/usr/bin/env node
// postinstall — copies snitch hooks into $OPENCLAW_CONFIG_DIR/hooks/

import fs from "node:fs";
import path from "node:path";

const HOOK_DIRS = ["snitch-bootstrap", "snitch-message-guard"];

export type InstallResult =
  | { success: true; installed: string[] }
  | { success: false; error: string; installed: string[] };

export function installHooks(
  srcHooksDir: string,
  targetHooksDir: string,
): InstallResult {
  const installed: string[] = [];

  if (!fs.existsSync(srcHooksDir)) {
    return { success: false, error: `Source hooks dir not found: ${srcHooksDir}`, installed };
  }

  fs.mkdirSync(targetHooksDir, { recursive: true });

  for (const hookName of HOOK_DIRS) {
    const src = path.join(srcHooksDir, hookName);
    if (!fs.existsSync(src)) continue;

    const dest = path.join(targetHooksDir, hookName);
    fs.cpSync(src, dest, { recursive: true, force: true });
    installed.push(hookName);
  }

  return { success: true, installed };
}

export function updateOpenclawConfig(configPath: string): void {
  let cfg: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }

  // Only touch hooks.internal.entries — plugins section is managed by
  // `openclaw plugins install` and we must not clobber it.
  if (!cfg.hooks) cfg.hooks = {};
  const hooks = cfg.hooks as Record<string, unknown>;
  if (!hooks.internal) hooks.internal = {};
  const internal = hooks.internal as Record<string, unknown>;
  internal.enabled = true;
  if (!internal.entries) internal.entries = {};
  const entries = internal.entries as Record<string, unknown>;
  for (const hookName of HOOK_DIRS) {
    entries[hookName] = { enabled: true };
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n");
}

// --- CLI entry point ---
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename ?? "")) {
  const openclawDir = process.env.OPENCLAW_CONFIG_DIR;
  if (!openclawDir) {
    console.error("OPENCLAW_CONFIG_DIR is not set — cannot install hooks.");
    console.error("Set it to your OpenClaw config directory (e.g. ~/.openclaw).");
    process.exit(1);
  }

  const srcHooks = path.join(path.dirname(import.meta.filename ?? ""), "..", "hooks");
  const targetHooks = path.join(openclawDir, "hooks");

  console.log(`Installing snitch hooks into ${targetHooks} ...`);
  const result = installHooks(srcHooks, targetHooks);

  if (!result.success) {
    console.error(`Install failed: ${result.error}`);
    process.exit(1);
  }

  for (const name of result.installed) {
    console.log(`  ✓ ${name}`);
  }

  const configPath = path.join(openclawDir, "openclaw.json");
  console.log(`Enabling hooks in ${configPath} ...`);
  updateOpenclawConfig(configPath);
  console.log(`  ✓ hooks.internal.entries updated`);

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🚨 superpack-snitch — installed successfully               ║
╚══════════════════════════════════════════════════════════════╝

  Hooks copied to:  ${targetHooks}
  Config updated:   ${configPath}

  Next steps:

  1. Lock down the plugin so the agent can't self-modify:

     chmod -R a-w ${openclawDir}/extensions/superpack-snitch

  2. (Optional) Customize the blocklist in openclaw.json:

     {
       "plugins": {
         "config": {
           "superpack-snitch": {
             "blocklist": ["clawhub", "clawdhub", "your-term-here"]
           }
         }
       }
     }

  Tip: You can also install the superpack-snitch SKILL from ClawHub
       for prompt-injection-only protection (no npm required).
       The skill and plugin can be used together for layered defense.
`);
}
