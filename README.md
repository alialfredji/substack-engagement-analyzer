# Substack Engagement Analyzer

A small Substack engagement scanner built with Next.js, TypeScript, and Shadcn UI.

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), paste a Substack profile or publication URL, and choose:

- Days to scan — defaults to 14.
- Requests per minute — defaults to 40.
- Parallel requests — defaults to 4.

The server enforces one global start-rate limit even when several requests are in flight. It retries HTTP 429 and transient upstream failures with bounded exponential backoff.

## Reports

Results include combined, Notes-only, and articles-only rankings. The score weights comments at 3 points, restacks at 2, and likes at 1.

Completed reports are saved in browser local storage. Running the same profile or publication URL with the same date range loads the cached report immediately; use **Rerun fresh** to bypass it. Up to six recent reports are retained. **Export CSV** downloads the currently selected Combined, Notes, or Articles view.

Public Substack lists can expose fewer identities than their displayed totals, and some comment threads are gated. The report keeps both reported and enumerated coverage and shows a warning when they differ.

## Verify

```bash
pnpm test
pnpm lint
pnpm build
pnpm smoke https://substack.com/@alialfredji 1 60 4
```

The smoke command accepts: profile URL, days, requests per minute, and concurrency.
