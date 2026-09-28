import { describe, expect, it } from "vitest"

import { cacheKeyForInput, listCachedScans, readCachedScan, readLatestCachedScan, saveCachedScan } from "./report-cache"
import type { ScanReport } from "./substack/types"

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

function report(profileUrl = "https://substack.com/@alialfredji?"): ScanReport {
  return {
    target: {
      userId: 1,
      handle: "alialfredji",
      name: "Ali Alfredji",
      photoUrl: null,
      profileUrl: "https://substack.com/@alialfredji",
      publicationId: 2,
      publicationName: "Modern Builder",
      publicationSubdomain: "alialf",
      publicationUrl: "https://alialf.substack.com",
    },
    input: { profileUrl, days: 14, requestsPerMinute: 40, concurrency: 4 },
    generatedAt: "2026-09-17T12:00:00.000Z",
    cutoffAt: "2026-09-03T12:00:00.000Z",
    people: [],
    coverage: {
      reportedLikes: 0,
      enumeratedLikes: 0,
      reportedRestacks: 0,
      enumeratedRestacks: 0,
      reportedComments: 0,
      enumeratedComments: 0,
    },
    stats: {
      requests: 10,
      retries: 0,
      rateLimits: 0,
      notesScanned: 2,
      articlesScanned: 1,
      durationMs: 5_000,
    },
    warnings: [],
  }
}

describe("report cache", () => {
  it("normalizes query strings when generating cache keys", () => {
    const first = report().input
    const second = { ...first, profileUrl: "https://SUBSTACK.com/@AliAlfredji/" }
    expect(cacheKeyForInput(first)).toBe(cacheKeyForInput(second))
  })

  it("stores, reads, and restores the latest report", () => {
    const storage = new MemoryStorage()
    const value = report()

    expect(saveCachedScan(value, storage)).not.toBeNull()
    expect(readCachedScan(value.input, storage)?.report.target.name).toBe("Ali Alfredji")
    expect(readLatestCachedScan(storage)?.report.input.days).toBe(14)
  })

  it("lists retained reports newest first for the history panel", () => {
    const storage = new MemoryStorage()
    const older = { ...report("https://substack.com/@older"), generatedAt: "2026-09-16T12:00:00.000Z" }
    const newer = report("https://substack.com/@newer")

    saveCachedScan(older, storage)
    saveCachedScan(newer, storage)

    expect(listCachedScans(storage).map((entry) => entry.report.input.profileUrl)).toEqual([
      "https://substack.com/@newer",
      "https://substack.com/@older",
    ])
  })

  it("keeps more than six different reports", () => {
    const storage = new MemoryStorage()

    for (let index = 0; index < 8; index += 1) {
      saveCachedScan(
        { ...report(`https://substack.com/@reader${index}`), generatedAt: `2026-09-${String(index + 10).padStart(2, "0")}T12:00:00.000Z` },
        storage,
      )
    }

    expect(listCachedScans(storage)).toHaveLength(8)
  })
})
