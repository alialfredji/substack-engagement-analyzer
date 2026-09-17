import type { ReportView } from "@/components/engagement-table"
import type { MetricSet, ScanReport } from "@/lib/substack/types"

function metricsFor(report: ScanReport, personIndex: number, view: ReportView): MetricSet {
  const person = report.people[personIndex]
  if (view === "notes") return person.notes
  if (view === "articles") return person.articles
  return person.combined
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

export function reportToCsv(report: ScanReport, view: ReportView) {
  const headers = [
    "rank",
    "name",
    "handle",
    "writes",
    "profile_url",
    "score",
    "total",
    "likes",
    "comments",
    "restacks",
    "last_comment_at",
    "last_signal_at",
  ]

  const people = report.people
    .map((person, index) => ({ person, metrics: metricsFor(report, index, view) }))
    .filter(({ metrics }) => metrics.total > 0)
    .sort((a, b) => b.metrics.score - a.metrics.score || b.metrics.total - a.metrics.total)

  const rows = people.map(({ person, metrics }, index) =>
    [
      index + 1,
      person.name,
      person.handle,
      person.writes,
      person.profileUrl,
      metrics.score,
      metrics.total,
      metrics.likes,
      metrics.comments,
      metrics.restacks,
      person.lastCommentAt,
      person.lastSignalAt,
    ]
      .map(csvCell)
      .join(","),
  )

  return [headers.map(csvCell).join(","), ...rows].join("\n")
}

export function csvFilename(report: ScanReport, view: ReportView) {
  const target = report.target.handle ?? report.target.name
  const slug = target.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return `signal-map-${slug || "report"}-${view}-${report.generatedAt.slice(0, 10)}.csv`
}
