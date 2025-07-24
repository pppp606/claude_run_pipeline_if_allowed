# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) for executing pipeline commands safely.

## Pipeline Command Execution with run_pipeline_if_allowed.js

Use `run_pipeline_if_allowed.js` to execute shell command pipelines with permission validation. This script ensures only explicitly allowed commands are executed.

Commands must be provided as a JSON array, where each element represents a command in the pipeline.

### Usage Examples

#### Single Command
```bash
node scripts/run_pipeline_if_allowed.js '["ls -la"]'
```

#### Pipeline Commands
```bash
node scripts/run_pipeline_if_allowed.js '["ls -la", "grep \".js\"", "sort"]'
```

#### Complex Pipelines with Special Characters
```bash
node scripts/run_pipeline_if_allowed.js '["git log --oneline", "head -10", "grep \"feat\""]'
```

#### Commands with Quotes
```bash
node scripts/run_pipeline_if_allowed.js '["echo \"Hello, world!\"", "grep \",\""]'
```
