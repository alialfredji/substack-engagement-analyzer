import { afterEach, describe, expect, it, vi } from "vitest"

import { RequestScheduler } from "./rate-limiter"

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("public scan pacing", () => {
  it("keeps requests from separate scans at most one start per second", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-28T10:00:00.000Z"))
    const starts: number[] = []
    vi.stubGlobal("fetch", vi.fn(async () => {
      starts.push(Date.now())
      return Response.json({ ok: true })
    }))

    const first = new RequestScheduler({ requestsPerMinute: 60, concurrency: 4 })
    const second = new RequestScheduler({ requestsPerMinute: 60, concurrency: 4 })
    const results = Promise.all([
      first.json("https://substack.com/api/one"),
      second.json("https://substack.com/api/two"),
    ])

    await vi.runAllTimersAsync()
    await results

    expect(starts).toHaveLength(2)
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1_000)
  })
})
