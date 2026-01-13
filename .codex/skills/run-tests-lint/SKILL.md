---
name: run-tests-lint
description: Run the repository test suite and lint checks, report results, and note any failures or required approvals.
---

# Run Tests and Lint

Use this skill when the user asks to run tests, check linting, or validate CI-style checks.

## Workflow

1. From repo root, run `source ~/.zshrc` then `nvm use 20` to select Node.js 20 LTS.
2. Then run:
   - `npm test`
   - `npm run lint`
3. If either command fails due to sandbox limits, rerun with required approval.
4. Summarize pass/fail status and highlight any failing test files or lint errors.
5. If commands are missing, check `package.json` scripts and report the gap.
