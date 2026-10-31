# Forecast Notebook

A student-facing Q1 forecasting tool for the shared AI Pipe cost market. It explains the task, archives public evidence, compares numerical forecasts, optionally asks a student's LLM for two review perspectives, and lets the student explicitly confirm a zero-credit prediction.

**No trading code, automatic exam submission, server-side credential storage, or guaranteed-grade claims.**

## Run locally

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
npm run collect
npm run build
npm start
```

Open http://localhost:3000. The app serves the production frontend and a public-data relay. To develop, run `npm start` for the relay and `npm run dev` in a second terminal.

## Student workflow

1. Open **My prediction**. The homepage has three numbered steps: get a range, copy a reason, and save in the official game. **How to play** explains each click.
2. Read the suggested range and edit or copy its plain-language explanation. No token or file import is required.
3. Optionally open **Improve reason**. Paste an AI Pipe API token, choose **Check token and load models**, select a model returned for that route, add a real personal concern, approve the paid calls, and choose **Review prediction and improve reason**.
4. In the official game, choose the same range under **Your prediction**, leave **Credits to trade** at **0**, paste **Your reason**, and click **Save prediction**, not Review trade. Check for a row with your range and explanation under My answers.
5. Alternatively, use **Save to game** (previously My account). Paste the fresh **game entry token**, verify the account, review the draft, and confirm. This is a shortcut, not a new account, and it does not accept the AI Pipe token.
6. Check again when evidence changes. The page refreshes while visible, but never submits updates unattended.
7. After settlement, get the personal result code, paste it into Q1, and press **Check → Save**.

Technical warnings and method comparisons are under an optional details section. **Advanced data** is in the footer. Its import control is hidden by default and only accepts an archive/export such as `forecast-evidence.json` previously downloaded from this solver. Ordinary students do not need it.

Entry tokens expire after about 20 minutes. The market exchanges one for a separate signed-in session. **The session lifetime has not been verified.** Reconnect when rejected or after reloading this app. Expired access does not erase predictions already saved by the official service.

## Hosting

### Selected: GitHub repository + Cloudflare Pages + GitHub Actions

The repository stores the code and public archive; Cloudflare Pages hosts the static frontend; GitHub Actions collects public reports. Each student's browser calculates the forecast and makes its own authenticated game/model requests. No personal backend or deployment credential is needed.

Follow [CLOUDFLARE.md](CLOUDFLARE.md) for signup and the exact build settings. Use `npm ci && npm run build:cloudflare`, output `dist`, production branch `main`. The build script sets static mode and the `/` path automatically. You do not need to turn on GitHub Pages.

The **Collect public evidence and verify** workflow runs at minute 17 each hour and can be started manually. It validates reports, runs tests/build, and commits only changed public archive files. GitHub Actions needs permission to write repository contents; branch protection must permit the archive bot's commits. Cloudflare's Git integration builds new commits.

The scheduled archive preserves history, and the static browser attempts a current official-feed read through the fixed token-free `https://aipipe.org/proxy/https://stats.aipipe.org/usage.json` URL. Source failures remain visible; no AI call or credential forwarding is involved in this feed read.

Schedules can be delayed and Cloudflare free builds are limited. Identical reports do not create archive commits. Check failed workflows rather than assuming hourly execution is guaranteed. Saving is blocked when source evidence exceeds twelve hours or live market rules cannot be validated.

### Render free web service

`render.yaml` is included. Use this directory as the repository root, or set the Render service's root directory to it.

- Build: `npm ci && npm run build`
- Start: `npm start`
- Health check: `/api/health`
- Node: 24.22.1

The relay fetches the official public feed on demand and caches automatic reads for ten minutes. A manual **Refresh prediction** or research download requests `?refresh=1`, bypassing that cache once at least a minute has elapsed since the last attempt. Concurrent reads share one request. The one-minute minimum prevents repeated button presses from hammering the source. If the hosted relay fails, the browser attempts the fixed token-free public feed relay. The app has **no private account or LLM endpoint**; browser-to-market and browser-to-provider requests do not pass through Render.

Render free services sleep after 15 idle minutes and can take roughly a minute to wake. Their local filesystem is ephemeral; no background worker or cron free tier is supplied. **Keep the scheduled GitHub archive workflow if you deploy on Render**, so days that roll out of the official feed remain in version-controlled public data. Rebuild Render from those updates, or use the static Pages deployment for the durable archive. A Render-only instance with no collection workflow can lose target days after restart.

Do not use uptime pings to imply a persistence or availability guarantee. The application does not run a closed-browser personal autopilot on either free host.

References checked 2026-10-27: https://render.com/docs/free and https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages

## Optional LLM review

- **AI Pipe (default):** `https://aipipe.org/openai/v1`, plain model preset `gpt-5.6-terra`, matching `ga3-solver/providers.py`. Reasoning models use `max_completion_tokens: 4096`, `reasoning_effort: low`, and JSON-object response format; ordinary models use `max_tokens`. These are source-backed integration defaults, not a promise of permanent live model availability.
- **Read-only AI Pipe checks:** `GET https://aipipe.org/usage` returns the token's account and reported limit/cost; `GET /openai/v1/models` returns the selected route's model list. The UI shows account/remaining allowance and offers returned models. Checks run again before a paid review. A missing model stops inference rather than guessing. Authentication and allowance errors do not invoke a backup.
- **Optional AI Pipe OpenRouter route:** under Advanced model settings, use `https://aipipe.org/openrouter/v1` and vendor/model IDs. Its public OpenRouter catalog is explicitly separate from account verification. A public listing does not prove per-account availability.
- **Optional AI Pipe backup:** disabled by default. If a student enables it and approves up to four paid calls, a listed `gpt-5.4-mini` may be attempted once per pass after an unavailable model or invalid response. No fallback is used for quota/authentication, rate limits, canceled requests, or ambiguous network failures. Output records actual model names, attempts and returned token usage. Providers can charge failed or canceled requests.
- Live authenticated AI Pipe inference was not exercised during development: account checks, routing, model selection, structured output, and bounded fallback were tested using mocked API responses. No real student API balance was spent.
- **Anthropic:** official SDK, default model `claude-opus-5-5`, streamed responses, optional provider-default fallback enabled initially.
- **OpenAI-compatible:** enter your provider's HTTPS base URL and exact model ID. The adapter uses the documented chat-completions shape; providers without this API or browser CORS are not supported. No provider was tested with a paid key during development.
- API keys stay in React state/in-memory clients; never browser storage, application logs, our relay, exports, or git.
- The student approves two paid requests, or at most four with the optional AI Pipe backup. No unapproved paid retries. Failed or canceled requests can still incur provider charges.
- First pass receives observations and the student's optional context but not our forecast. Second pass critiques both the first opinion and numerical model.
- Strict output parsing checks real range IDs, available evidence dates, and explanation length. It does **not** prove every generated numerical sentence; the student reviews the draft.
- The LLM cannot change the numerical solver, place trades, call the market, or submit a draft. Applying its draft is an explicit UI action, followed by separate confirmation to save.
- Two passes using the same model are not statistically independent. Agreement is not proof, guaranteed accuracy, or guaranteed marks. Distinctive wording is not necessarily better reasoning.

Browser-held keys are accessible to anyone with control of that browser/page. Use only a deployment you trust. There is no third-party analytics or runtime script CDN; application dependencies are bundled. External font loading uses Google Fonts and is optional for rendering.

## One-file external LLM research export

**Download everything for my own AI** creates `q1-llm-research.txt`. It first attempts to reload public data and, when connected, the permitted game records. It recomputes the forecast at export time rather than copying an outdated UI result.

The file includes:

- Every retained normalized daily spending row, completeness/availability, publication dates, sources and revisions.
- Actual market intervals, dates, published scoring rules and authoritative source links.
- Current model estimates, blend weights, weekly backtests, simulated range shares, observed target subtotal and unknown dates.
- Human-readable method specifications and the exact `src/forecast.ts` / `src/core.ts` calculation source with SHA-256 hashes.
- Both in-app review prompts and a ready-to-use external review request.
- Returned class market weights and only explicitly shared peer choices/reasons, when connected.
- Data-age metadata, refresh failures, import status, exclusions and coverage limitations.

Personal account history, own forecasts, identities, provider/session credentials and signed receipts are not exported. Peer text is sanitized and labeled as untrusted opinion; unknown/private sharing fields are withheld. It is a bounded export of retained records, not every historical AI Pipe request or all private class submissions. Original raw feed bytes/provider breakdowns and a full point-in-time revision database are not represented as present.

An exported file is a snapshot, not a live document. Download again to get newer data. Failed refreshes produce labeled previously available evidence; a stale packet is never called verified current data. The exporter makes no paid LLM request.

The guide now opens with **what the game is**, then gives **manual play** before **solver-assisted play**. Common doubts are restored at the end. Optional AI review, direct saving, and external-LLM export share one separate box. Useful, Important, Mandatory, Caution, and Dates use distinct labeled treatments; labels preserve meaning without relying only on color.

**Forecast reliability:** the forecast is a reproducible estimate from completed, available public observations. Seeded simulations explore uncertainty; the same evidence and calculation conditions produce the same result rather than a newly random choice on every refresh. A short explanation of this is available beside the suggested range. Live-source failures are displayed instead of silently describing the archive as freshly acquired data. Future usage and perfect accuracy cannot be guaranteed. Once all seven valid target totals are available, the observed subtotal/range uses exact decimal arithmetic.

## Data integrity and methods

- `lossless-json` retains the source decimal spelling; `decimal.js` sums completed totals and selects half-open ranges without rounding them first.
- Missing or unavailable totals remain unknown. Incomplete days are excluded. UTC dates, timezone-qualified publication times, duplicates, future reports, contradictory same-timestamp rows, negative amounts, altered target dates, and invalid ranges are checked.
- The archive records completed-day revisions and first availability of each retained value. Newer reports take precedence, including withdrawal of a previously completed total.
- Bootstrap history comes from the public `sarangkrish27/aipipe-usage-tracker` archive, labeled as third-party copies, plus direct official captures. Earlier investigation matched the 26 and 27 October responses byte-for-byte with independently captured official responses. Third-party data is not represented as an official attestation.
- Models: mean of recent seven observations, mean of three observations, exponential smoothing (alpha 0.4), and weekday estimates shrunk toward the recent level.
- Historical tests match the current unknown dates, weekdays, remaining-day count, lead time, and evaluation-time cutoff. Whole-week shifts produce up to twelve non-overlapping target windows rather than counting adjacent, highly overlapping weeks as independent tests. Historical target dates are excluded from training even when an earlier missing report is being estimated; folds without the required observations or last training date are skipped. Later-revised training values are conservatively excluded when their earlier version is no longer represented. The archive is not a complete point-in-time research database.
- Fewer than three matching past weeks per method gives equal weights. Otherwise weights are inverse remaining-total mean absolute error with a floor, not optimized on the target outcome. Three tests are still limited evidence, not proof of a reliable model.
- With enough matching history, 6,000 seeded scenarios sample each method's actual signed remaining-total errors, plus an explicitly assumed common level stress. They do not add raw weekday spending variation on top of a weekday prediction. With sparse history, the older broad three-day deviation/stress scenarios remain a labeled provisional fallback; the audited 31 October $41.45 estimate is unchanged. Neither mode produces calibrated probabilities, and unexpected calendar effects or regime changes can still fall outside the interval.
- Forecast identity includes the market rules, usable availability timestamps, the missing-day mask and matching errors, so a change affecting the calculation invalidates the draft. Republishing unchanged values with the same availability history does not change the numerical result.
- Method totals and daily estimates include mean matched historical errors when sufficient history exists. The weekly headline is a simulated median, so it need not equal the sum of daily mean estimates. Known subtotals stay decimal-exact when classifying both method totals and simulations.
- Fully observed target totals use exact arithmetic and are labeled observed, never as an official settlement token.
- Import/export supports reproducible analysis. Imported data disables submission for the rest of that page session, even after refresh. Reload without importing to restore normal operation.

## Reliability and safety boundaries

- In-memory session only; no assumption that the entry token and session have equal lifetimes.
- No authentication or paid calls during tests: external account and LLM routes are mocked.
- Live identity, configuration, and settlement state are read before saving. Course forecasts use one selected outcome, private explanation/choice, and no trade payload.
- A stable idempotency key is reused after ambiguous network failure for an unchanged pending draft. An accepted save is not repeated automatically if readback fails.
- Session rejection clears access. The live suggestion and untouched solver drafts update with new completed-day evidence; edited or AI-written drafts are preserved and marked outdated when needed. Official saved predictions change only after a separate confirmed save.
- Save to game displays a readable personal-history table by merging the documented private `portfolio.forecasts` / `portfolio.journal` records with matching own feed events. Source observations and other students' entries are excluded. A separate read-only button refreshes history. Unrecognized response shapes are not presented as proof of no previous participation.
- Text renders as React text, never raw LLM HTML. No generic server proxy or arbitrary server-side fetch URL is exposed.
- Closing/reloading the page clears secrets and stops browser work. The public archive collector is separate from account actions.

## Tests

```sh
npm test
npm run build
npm audit
npx playwright install chromium
npm run test:e2e
```

To use an installed Chrome instead of downloading Chromium:

```powershell
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run test:e2e
```

The browser suite drives the built app, verifies confirmation gates, mocked LLM review, no token persistence, import restrictions, phone layout, and guide navigation. The real public-data relay can be checked with `GET /api/data`. No real prediction, trade, or exam submission is required for tests.

## Project map

- `src/core.ts`: strict input validation, lossless money, archive merging, market rules.
- `src/forecast.ts`: forecast methods, historical folds, simulations, evidence packets.
- `src/llm.ts`: AI Pipe account/model verification, route-specific payloads, paid-call consent boundary and bounded fallback.
- `src/reviewPrompts.ts`: shared prompt templates used by in-app review and exports.
- `src/researchPacket.ts`: refreshed one-file external-LLM packet, safe shared-data projection and source hashes.
- `src/network.ts`: public data loading and forecast-only market client.
- `src/App.tsx`, `src/Guide.tsx`: student workflow and plain-language guide.
- `server/index.ts`: optional stateless public-feed relay and static hosting.
- `scripts/collect.ts`: public data collector; accepts an explicit `--bootstrap <snapshot-directory>` for rebuilding from retained snapshots.
- `.github/workflows/pages.yml`: durable public archive and Pages deployment.

The repository is prepared for GitHub-backed Cloudflare Pages hosting. Cloudflare signup and repository authorization are completed in the deployment owner's account; pushing code alone does not create a live Cloudflare site.
