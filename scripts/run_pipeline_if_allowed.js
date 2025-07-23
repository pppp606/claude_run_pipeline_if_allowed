#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const SETTINGS_PATHS = [
  path.resolve('.claude/settings.json'),
  path.resolve('.claude/settings.local.json'),
];

// Load and merge allow lists
let allowList = [];
for (const p of SETTINGS_PATHS) {
  if (fs.existsSync(p)) {
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    const items = json?.permissions?.allow ?? [];
    allowList.push(...items);
  }
}
allowList = [...new Set(allowList)]; // dedupe

// Parse arguments (assumes commands are passed like: node run_pipeline.js cmd1 | cmd2 ...)
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('❌ Usage: node run_pipeline.js <cmd1> | <cmd2> | ...');
  process.exit(1);
}

// Split args by `|`
const raw = args.join(' ');
const segments = raw.split('|').map(s => s.trim());

// Function to match a command against allowList
function isAllowed(command) {
  const tokens = command.split(/\s+/);
  for (let i = tokens.length; i > 0; i--) {
    const prefix = tokens.slice(0, i).join(' ');
    if (allowList.some(p =>
      p === `Bash(${prefix})` || p === `Bash(${prefix}:*)`
    )) {
      return true;
    }
  }
  return false;
}

// Check each segment
for (const seg of segments) {
  if (!isAllowed(seg)) {
    console.error(`⛔ Not allowed: ${seg}`);
    process.exit(1);
  }
}

// Execute as full pipeline
try {
  const output = execSync(raw, { stdio: 'inherit', shell: '/bin/bash' });
} catch (err) {
  process.exit(err.status ?? 1);
}
