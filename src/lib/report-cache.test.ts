import { describe, expect, it } from "vitest"

import { cacheKeyForInput, readCachedScan, readLatestCachedScan, saveCachedScan } from "./report-cache"
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
})
