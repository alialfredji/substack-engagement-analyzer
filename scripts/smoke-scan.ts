import { scanEngagement } from "../src/lib/substack/scanner"

const profileUrl = process.argv[2] ?? "https://substack.com/@alialfredji"
const days = Number(process.argv[3] ?? 1)
const requestsPerMinute = Number(process.argv[4] ?? 60)
const concurrency = Number(process.argv[5] ?? 4)

async function main() {
  const report = await scanEngagement(
    { profileUrl, days, requestsPerMinute, concurrency },
    {
      onProgress(progress) {
        process.stderr.write(
          `\r${progress.phase.padEnd(11)} ${progress.completed}/${progress.total || "?"} · ${progress.requests} requests`,
        )
      },
    },
  )

  process.stderr.write("\n")
  console.log(
    JSON.stringify(
      {
        target: report.target,
        people: report.people.length,
        notes: report.stats.notesScanned,
        articles: report.stats.articlesScanned,
        requests: report.stats.requests,
        retries: report.stats.retries,
        rateLimits: report.stats.rateLimits,
        warnings: report.warnings,
        topFive: report.people.slice(0, 5).map((person) => ({
          name: person.name,
          profileUrl: person.profileUrl,
          score: person.combined.score,
          likes: person.combined.likes,
          comments: person.combined.comments,
          restacks: person.combined.restacks,
        })),
      },
      null,
      2,
    ),
  )
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
