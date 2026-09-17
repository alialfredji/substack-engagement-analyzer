const DEFAULT_HEADERS = {
  accept: "application/json, text/plain, */*",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
}

export interface SchedulerStats {
  requests: number
  retries: number
  rateLimits: number
}

interface SchedulerOptions {
  requestsPerMinute: number
  concurrency: number
  signal?: AbortSignal
  onRetry?: (message: string) => void
}

class Semaphore {
  private active = 0
  private readonly waiting: Array<() => void> = []

  constructor(private readonly maximum: number) {}

  async acquire() {
    if (this.active >= this.maximum) {
      await new Promise<void>((resolve) => this.waiting.push(resolve))
    }
    this.active += 1

    return () => {
      this.active -= 1
      this.waiting.shift()?.()
    }
  }
}

function wait(ms: number, signal?: AbortSignal) {
  if (ms <= 0) return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException("The scan was cancelled.", "AbortError"))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function retryDelay(response: Response | null, attempt: number) {
  const retryAfter = response?.headers.get("retry-after")
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) return Math.min(seconds * 1_000, 60_000)

    const dateDelay = new Date(retryAfter).getTime() - Date.now()
    if (dateDelay > 0) return Math.min(dateDelay, 60_000)
  }

  const exponential = Math.min(1_000 * 2 ** attempt, 30_000)
  return exponential + Math.floor(Math.random() * 500)
}

export class RequestScheduler {
  readonly stats: SchedulerStats = { requests: 0, retries: 0, rateLimits: 0 }

  private readonly semaphore: Semaphore
  private intervalMs: number
  private nextStartAt = 0
  private cooldownUntil = 0
  private paceTail = Promise.resolve()

  constructor(private readonly options: SchedulerOptions) {
    this.semaphore = new Semaphore(options.concurrency)
    this.intervalMs = 60_000 / options.requestsPerMinute
  }

  async json<T>(url: string): Promise<T> {
    return this.request(url, async (response) => (await response.json()) as T)
  }

  async text(url: string): Promise<string> {
    return this.request(url, (response) => response.text())
  }

  private async pace() {
    const slot = this.paceTail.then(async () => {
      const delay = Math.max(0, this.nextStartAt - Date.now(), this.cooldownUntil - Date.now())
      await wait(delay, this.options.signal)
      this.nextStartAt = Date.now() + this.intervalMs
    })

    this.paceTail = slot.catch(() => undefined)
    await slot
  }

  private async request<T>(
    url: string,
    parse: (response: Response) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown

    for (let attempt = 0; attempt <= 4; attempt += 1) {
      this.options.signal?.throwIfAborted()
      const release = await this.semaphore.acquire()
      let response: Response | null = null

      try {
        await this.pace()
        this.stats.requests += 1
        response = await fetch(url, {
          cache: "no-store",
          headers: DEFAULT_HEADERS,
          signal: this.options.signal,
        })

        if (response.ok) return await parse(response)

        if (response.status !== 429 && response.status < 500) {
          throw new Error(`Substack returned HTTP ${response.status} for ${new URL(url).pathname}.`)
        }

        if (response.status === 429) this.stats.rateLimits += 1
        lastError = new Error(`Substack returned HTTP ${response.status}.`)
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error
        lastError = error
      } finally {
        release()
      }

      if (attempt === 4) break

      this.stats.retries += 1
      const delay = retryDelay(response, attempt)
      if (response?.status === 429) {
        this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + delay)
        this.intervalMs = Math.min(this.intervalMs * 1.25, 6_000)
      }
      this.options.onRetry?.(
        `Substack slowed this scan down. Retrying in ${Math.ceil(delay / 1_000)}s.`,
      )
      await wait(delay, this.options.signal)
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Substack could not complete this request.")
  }
}

export async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let index = 0

  async function runWorker() {
    while (index < items.length) {
      const current = index
      index += 1
      await worker(items[current], current)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  )
}
