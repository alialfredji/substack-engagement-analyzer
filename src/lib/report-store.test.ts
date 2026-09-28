import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ScanReport } from "@/lib/substack/types"

const directories: string[] = []

afterEach(async () => {
  delete process.env.REPORTS_DIR
  vi.resetModules()
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("report store", () => {
  it("saves separate same-day scans and reads their public snapshots", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "engagers-reports-"))
    directories.push(directory)
    process.env.REPORTS_DIR = directory
    const { saveReport, readReport } = await import("./report-store")
    const report = {
      target: {
        handle: "@Writer", userId: 42, name: "Writer", photoUrl: null,
        profileUrl: "https://substack.com/@Writer", publicationId: null,
        publicationName: null, publicationSubdomain: null, publicationUrl: null,
      },
      input: { profileUrl: "https://substack.com/@Writer", days: 14, requestsPerMinute: 50, concurrency: 4 },
      generatedAt: "2026-09-28T12:00:00.000Z",
      cutoffAt: "2026-09-14T12:00:00.000Z",
      people: [],
      coverage: {
        reportedLikes: 0, enumeratedLikes: 0, reportedRestacks: 0,
        enumeratedRestacks: 0, reportedComments: 0, enumeratedComments: 0,
      },
      stats: { requests: 1, retries: 0, rateLimits: 0, notesScanned: 1, articlesScanned: 0, durationMs: 100 },
      warnings: [],
    } satisfies ScanReport

    const first = await saveReport(report)
    const second = await saveReport(report)
    expect(first).toMatch(/^\/r\/writer\/2026-09-28\/[0-9a-f-]{36}$/)
    expect(second).not.toBe(first)
    expect(await readReport("writer", "2026-09-28", first.split("/").at(-1)!)).toEqual(report)
    expect(await readReport("..", "2026-09-28", first.split("/").at(-1)!)).toBeNull()
  })
})
