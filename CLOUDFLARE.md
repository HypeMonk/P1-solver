# Deploy on Cloudflare Pages

The public repository is the code and archive home. Cloudflare serves the static site; GitHub Actions collects public spending reports. No Cloudflare Worker, Render account, server process, or deployment secret is required.

## Account and first deployment

1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up and verify the email.
2. Open **Workers & Pages**, select **Create application**, then choose **Pages** and **Connect to Git** (wording can vary by dashboard version).
3. Connect GitHub and authorize access to **HypeMonk/P1-solver**. Repository-specific access is sufficient.
4. Select that repository and use these settings:

| Setting | Value |
|---|---|
| Project name | `p1-solver` |
| Production branch | `main` |
| Framework preset | `None` |
| Root directory | Leave empty; repository root |
| Build command | `npm ci && npm run build:cloudflare` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION=24.22.1` |

5. Save and deploy. Cloudflare provides the actual `pages.dev` address after the build; do not assume a particular hostname is available before it is assigned.
6. Open the deployed page and verify **My prediction**, **How to play**, and **Download everything for my own AI**. Use your own token only when testing account or AI features; those actions can submit predictions or spend provider balance.

`build:cloudflare` sets static mode and the `/` base path automatically. Do not use `npm start` on Cloudflare Pages. Do not add API keys, game tokens or signed result codes to build variables. They belong only in the student's own browser inputs.

## Public archive collection

The **Collect public evidence and verify** GitHub workflow runs at minute 17 each hour and can be run manually through Actions. It reads public reports, validates/builds the app, and commits only changed `public/data/archive.json` and `public/data/market.json`.

In GitHub Settings → Actions → General, enable read/write workflow permissions if necessary. The workflow declares `contents: write`. Branch protection must permit its archive commits. No personal provider/game credential is required.

Cloudflare's Git integration should build new public archive commits. The workflow intentionally does not deploy GitHub Pages. GitHub scheduled jobs can be delayed, and Cloudflare free builds are limited; identical reports do not generate archive commits. Check failed Actions runs rather than assuming an hourly schedule is guaranteed.

## Verify isolation and freshness

- Static requests contain bundled frontend files and public data only.
- Keys and sessions stay in each browser's memory. Game and model requests go directly to their official/provider endpoint.
- The browser attempts a current public-feed read through AI Pipe's fixed token-free URL proxy. The archived data remains available when a source is offline, with visible timestamps/failure messages.
- The game controls session expiry. Model providers control availability/rate limits. Hosting the static site does not remove those limits.

No Cloudflare account or deployment was created by preparing this repository. The signup and Git authorization must be completed in the owner's Cloudflare account.
