#!/usr/bin/env node
// snitch-check — CLI tool for testing the blocklist matcher
//
// Usage:
//   snitch-check <toolName> [paramsJson]
//   snitch-check --blocklist "term1,term2" <toolName> [paramsJson]
//
// Examples:
//   snitch-check read_file '{"path":"/tmp/clawhub-test.txt"}'
//   snitch-check clawhub_install
//   snitch-check --blocklist ".env,secrets" read_file '{"path":"/home/user/.env"}'

import { buildPatterns, evaluateToolCall, DEFAULT_BLOCKLIST } from "../src/lib.ts";

const args = process.argv.slice(2);

let blocklist = DEFAULT_BLOCKLIST;
let positional: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--blocklist" && args[i + 1]) {
    blocklist = args[++i].split(",").map((s) => s.trim()).filter(Boolean);
  } else {
    positional.push(args[i]);
  }
}

const [toolName, paramsRaw] = positional;

if (!toolName) {
  console.error("Usage: snitch-check [--blocklist term1,term2] <toolName> [paramsJson]");
  process.exit(1);
}

let params: unknown = {};
if (paramsRaw) {
  try {
    params = JSON.parse(paramsRaw);
  } catch {
    console.error(`Invalid JSON for params: ${paramsRaw}`);
    process.exit(1);
  }
}

const patterns = buildPatterns(blocklist);
const result = evaluateToolCall(toolName, params, patterns);

console.log(`Blocklist : ${blocklist.join(", ")}`);
console.log(`Tool name : ${toolName}`);
console.log(`Params    : ${JSON.stringify(params)}`);
console.log("");

if (result.blocked) {
  console.log(`🚨 BLOCKED — matched in: ${result.matchedIn}`);
  process.exit(2);
} else {
  console.log("✅ ALLOWED — no match");
  process.exit(0);
}
