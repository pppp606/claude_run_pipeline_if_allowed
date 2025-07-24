#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const SETTINGS_PATHS = [
  path.resolve('.claude/settings.json'),
  path.resolve('.claude/settings.local.json'),
];

// Load and merge allow lists
function loadAllowList() {
  let allowList = [];
  for (const p of SETTINGS_PATHS) {
    if (fs.existsSync(p)) {
      const json = JSON.parse(fs.readFileSync(p, 'utf8'));
      const items = json?.permissions?.allow ?? [];
      allowList.push(...items);
    }
  }
  return [...new Set(allowList)]; // dedupe
}

// Function to match a command against allowList
function isAllowed(command, allowList) {
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

// Main execution function
function runPipeline(args) {
  // Load allow list
  const allowList = loadAllowList();

  // Parse arguments
  if (args.length !== 1) {
    console.error('❌ Usage: node run_pipeline.js \'["cmd1", "cmd2", ...]\'');
    process.exit(1);
  }

  let segments;
  try {
    segments = JSON.parse(args[0]);
    if (!Array.isArray(segments)) {
      console.error('❌ Invalid JSON array format');
      process.exit(1);
      return; // Early return for testing
    }
  } catch (err) {
    console.error('❌ Invalid JSON array format');
    process.exit(1);
    return; // Early return for testing
  }

  // Check each segment
  for (const seg of segments) {
    if (!isAllowed(seg, allowList)) {
      console.error(`⛔ Not allowed: ${seg}`);
      process.exit(1);
      return; // Early return for testing
    }
  }

  // Execute as full pipeline
  const pipelineCommand = segments.join(' | ');
  try {
    const output = execSync(pipelineCommand, { stdio: 'inherit', shell: '/bin/bash' });
  } catch (err) {
    process.exit(err.status ?? 1);
    return; // Early return for testing
  }
}

// Export functions for testing
module.exports = {
  loadAllowList,
  isAllowed,
  runPipeline,
  SETTINGS_PATHS
};

// Only run if this file is executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  runPipeline(args);
}
