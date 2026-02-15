---
description: Automatically bump version, update cache, and deploy the application.
---

# Auto Release Workflow

This workflow automates the following steps:
1.  Increments the `APP_VERSION` in `pwa/common.js` (patch version).
2.  Increments the `CACHE_NAME` version in `pwa/sw.js`.
3.  Commits these changes to Git.
4.  Pushes code to Google Apps Script (`clasp push`).
5.  Deploys a new version on GAS (`clasp deploy`).
6.  Pushes changes to GitHub for GitHub Pages.

## Usage

Simply run the following command or ask the agent to "Release the app".

// turbo
```bash
npm run release
```
