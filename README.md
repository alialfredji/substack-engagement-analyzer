# Substack Engagers

See who shows up for your writing. Substack Engagers ranks people engaging with a creator's public Notes and articles, with separate views for each format and a CSV export.

Built by [Ali Alfredji](https://substack.com/@alialfredji), author of [Modern Builder](https://alialf.substack.com). This is an independent project and is not affiliated with Substack.

## Try it locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), paste a Substack profile or publication URL, and start a scan. The default is 14 days, 50 requests per minute, and four parallel requests. You can choose a longer date range; requests per minute are capped at 60. Substack may rate limit public requests, so lower the request rate or parallel count if a scan slows down.

Each completed scan is saved on the server and gets a public URL such as `/r/alialfredji/2026-09-28/<id>`. **Share report** opens the device share sheet or copies that URL. Anyone with the URL can view the saved snapshot without rescanning. Reports generated before this feature remain in the browser only; rerun those scans to create a shareable report.

Saved reports are listed automatically in the live `/sitemap.xml`, and `/robots.txt` points crawlers to it. Report pages use their public URL as the canonical URL. The sitemap reads the same persistent `REPORTS_DIR` as the report pages, so keep that volume across deployments. The canonical site origin is set in `src/lib/site.ts`; update it if the public hostname changes. Submit `https://substack-engagers.alfredji.com/sitemap.xml` in Google Search Console to monitor discovery and indexing. The sitemap currently uses one file, so split it if the collection approaches 50,000 URLs.

Recent reports are also cached in your browser's local storage. The sidebar is specific to the browser and device. **Rerun fresh** bypasses the browser cache. Reaction and restack totals may exceed the number of public identities that Substack exposes; the report flags incomplete coverage.

## Google Analytics

Create a GA4 web data stream for your site, then set `NEXT_PUBLIC_GA_MEASUREMENT_ID` to its `G-...` Measurement ID before running `pnpm build` or `docker compose build`. The ID is public and is embedded in the built app, so changing it requires a rebuild. Leave it unset to disable tracking.

The app records page views plus `scan_started`, `scan_completed`, `scan_cancelled`, `scan_failed`, `cached_report_opened`, and `csv_exported` events. Event details are limited to the scan date range, result count, duration, and exported view. Profile URLs and reader identities are not sent as event parameters. Check GA4 Realtime after visiting the site and running a scan.

## Package for a Node server

The app includes a standalone Next.js build, [Dockerfile](Dockerfile), [Compose file](compose.yaml), and `/api/health`. No credentials or database are required. Saved reports live in `REPORTS_DIR` (default `./data/reports` locally). Compose mounts a named `reports` volume at `/app/data`; keep this volume when rebuilding the container. Back it up separately from the personal server's PostgreSQL backups. For a local container test with persistence:

```bash
docker build -t substack-engagers:local .
docker run --rm -p 3000:3000 -v substack-engagers-reports:/app/data substack-engagers:local
```

The Compose file is ready for mac13's external `personal-server-edge` network and deliberately exposes no host port. Run one app replica: the 60-request-per-minute cap is shared by scans in one Node process, not across multiple replicas. Report files are immutable JSON snapshots; the URL's unique ID prevents same-day scans from overwriting one another.

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
