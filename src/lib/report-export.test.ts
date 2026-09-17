import { describe, expect, it } from "vitest"

import { csvFilename, reportToCsv } from "./report-export"
import type { ScanReport } from "./substack/types"

const report = {
  target: { handle: "writer", name: "Writer" },
  generatedAt: "2026-09-17T12:00:00.000Z",
  people: [
    {
      id: 1,
      name: 'Reader, "One"',
      handle: "readerone",
      photoUrl: null,
      profileUrl: "https://substack.com/@readerone",
      writes: "Reader One",
      combined: { likes: 2, comments: 1, restacks: 0, total: 3, score: 5 },
      notes: { likes: 2, comments: 1, restacks: 0, total: 3, score: 5 },
      articles: { likes: 0, comments: 0, restacks: 0, total: 0, score: 0 },
      lastSignalAt: "2026-09-17T11:00:00.000Z",
      lastCommentAt: "2026-09-17T10:00:00.000Z",
    },
  ],
} as ScanReport

describe("CSV export", () => {
  it("exports the visible report view with escaped values", () => {
    const csv = reportToCsv(report, "combined")
    expect(csv).toContain('"Reader, ""One"""')
    expect(csv).toContain('"5","3","2","1","0"')
  })

  it("omits people without engagement in the selected view", () => {
    expect(reportToCsv(report, "articles").split("\n")).toHaveLength(1)
  })

  it("builds a dated filename", () => {
    expect(csvFilename(report, "notes")).toBe("signal-map-writer-notes-2026-09-17.csv")
  })
})
