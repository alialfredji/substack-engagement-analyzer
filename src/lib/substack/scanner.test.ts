import { describe, expect, it } from "vitest"

import { aggregateEngagements, normalizeInput, parseTargetUrl } from "./scanner"
import type { EngagementEdge } from "./types"

describe("parseTargetUrl", () => {
  it("accepts a Substack profile URL", () => {
    expect(parseTargetUrl("https://substack.com/@alialfredji?utm_source=test")).toEqual({
      type: "profile",
      handle: "alialfredji",
    })
  })

  it("accepts a bare handle", () => {
    expect(parseTargetUrl("@lidiyawrites")).toEqual({
      type: "profile",
      handle: "lidiyawrites",
    })
  })

  it("accepts a publication URL", () => {
    expect(parseTargetUrl("https://alialf.substack.com/p/example")).toEqual({
      type: "publication",
      origin: "https://alialf.substack.com",
    })
  })
})

describe("normalizeInput", () => {
  it("keeps scan controls inside safe bounds", () => {
    expect(
      normalizeInput({
        profileUrl: " https://substack.com/@alialfredji ",
        days: 200,
         requestsPerMinute: 120,
        concurrency: 99,
      }),
    ).toEqual({
      profileUrl: "https://substack.com/@alialfredji",
       days: 200,
       requestsPerMinute: 60,
      concurrency: 8,
    })
  })
})

describe("aggregateEngagements", () => {
  it("combines activity while preserving Notes and article totals", () => {
    const actor = {
      id: 42,
      name: "Frequent Reader",
      handle: "frequentreader",
      photoUrl: null,
      writes: "Reader Notes",
    }
    const edges: EngagementEdge[] = [
      {
        actor,
        kind: "like",
        contentKind: "note",
        contentId: 1,
        signalAt: "2026-09-14T10:00:00.000Z",
        isExactTime: false,
      },
      {
        actor,
        kind: "comment",
        contentKind: "note",
        contentId: 1,
        signalAt: "2026-09-15T10:00:00.000Z",
        isExactTime: true,
      },
      {
        actor,
        kind: "restack",
        contentKind: "article",
        contentId: 2,
        signalAt: "2026-09-16T10:00:00.000Z",
        isExactTime: false,
      },
    ]

    const [person] = aggregateEngagements(edges)

    expect(person.combined).toEqual({ likes: 1, comments: 1, restacks: 1, total: 3, score: 6 })
    expect(person.notes).toEqual({ likes: 1, comments: 1, restacks: 0, total: 2, score: 4 })
    expect(person.articles).toEqual({ likes: 0, comments: 0, restacks: 1, total: 1, score: 2 })
    expect(person.lastCommentAt).toBe("2026-09-15T10:00:00.000Z")
    expect(person.lastSignalAt).toBe("2026-09-16T10:00:00.000Z")
  })
})
