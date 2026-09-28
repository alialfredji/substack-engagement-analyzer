# Substack Engagers

See who shows up for your writing. Substack Engagers ranks people engaging with a creator's public Notes and articles, with separate views for each format and a CSV export.

Built by [Ali Alfredji](https://substack.com/@alialfredji), author of [Modern Builder](https://alialf.substack.com). This is an independent project and is not affiliated with Substack.

## Try it locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), paste a Substack profile or publication URL, and start a scan. The default is 14 days, 50 requests per minute, and four parallel requests. You can choose a longer date range; requests per minute are capped at 60. Substack may rate limit public requests, so lower the request rate or parallel count if a scan slows down.

Completed reports are kept in your browser's local storage and listed in the scrollable **Recent reports** sidebar. There is no app-imposed report count limit, though your browser's storage quota still applies. The cache is specific to the browser and device. **Rerun fresh** bypasses a saved report. Reaction and restack totals may exceed the number of public identities that Substack exposes; the report flags incomplete coverage.

## Package for a Node server

The app includes a standalone Next.js build, [Dockerfile](Dockerfile), [Compose file](compose.yaml), and `/api/health`. No credentials or database are required. For a local container test:

```bash
docker build -t substack-engagers:local .
docker run --rm -p 3000:3000 substack-engagers:local
```

## Verify

```bash
pnpm test
pnpm lint
pnpm build
pnpm smoke https://substack.com/@alialfredji 1 50 4
```

The smoke command accepts a profile URL, days, requests per minute, and concurrency. The scanner uses public Substack endpoints and can change if Substack changes them.

## License

MIT. See [LICENSE](LICENSE). Copyright Ali Alfredji.
