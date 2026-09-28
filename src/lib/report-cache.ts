import type { ScanInput, ScanReport } from "@/lib/substack/types"

const CACHE_PREFIX = "signal-map:report:v1:"
const CACHE_INDEX_KEY = "signal-map:report-index:v1"

type CacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

export interface CachedScan {
  version: 1
  savedAt: string
  report: ScanReport
  sharePath?: string
}

interface CacheIndexEntry {
  key: string
  savedAt: string
}

function normalizeTarget(value: string) {
  const trimmed = value.trim()

  try {
    const url = new URL(trimmed)
    const path = url.pathname.replace(/\/+$/, "").toLowerCase()
    return `${url.hostname.toLowerCase()}${path}`
  } catch {
    return trimmed.toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "")
  }
}

export function cacheKeyForInput(input: ScanInput) {
  return `${CACHE_PREFIX}${encodeURIComponent(`${normalizeTarget(input.profileUrl)}|${input.days}`)}`
}

function readIndex(storage: CacheStorage): CacheIndexEntry[] {
  try {
    const parsed = JSON.parse(storage.getItem(CACHE_INDEX_KEY) ?? "[]") as unknown
    if (!Array.isArray(parsed)) return []

    return parsed.filter(
      (entry): entry is CacheIndexEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as CacheIndexEntry).key === "string" &&
        typeof (entry as CacheIndexEntry).savedAt === "string",
    )
  } catch {
    return []
  }
}

function parseCachedScan(value: string | null): CachedScan | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Partial<CachedScan>
    if (
      parsed.version !== 1 ||
      typeof parsed.savedAt !== "string" ||
      !parsed.report ||
      !Array.isArray(parsed.report.people)
    ) {
      return null
    }

    return parsed as CachedScan
  } catch {
    return null
  }
}

export function readCachedScan(input: ScanInput, storage: CacheStorage) {
  return parseCachedScan(storage.getItem(cacheKeyForInput(input)))
}

export function readLatestCachedScan(storage: CacheStorage) {
  return listCachedScans(storage)[0] ?? null
}

export function listCachedScans(storage: CacheStorage): CachedScan[] {
  return readIndex(storage)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .flatMap((entry) => {
      const cached = parseCachedScan(storage.getItem(entry.key))
      return cached ? [cached] : []
    })
}

export function saveCachedScan(report: ScanReport, storage: CacheStorage, sharePath?: string) {
  const key = cacheKeyForInput(report.input)
  const savedAt = report.generatedAt || new Date().toISOString()
  const cached: CachedScan = { version: 1, savedAt, report, sharePath }
  const currentIndex = readIndex(storage).filter((entry) => entry.key !== key)
  const nextIndex = [{ key, savedAt }, ...currentIndex]

  try {
    storage.setItem(key, JSON.stringify(cached))
    storage.setItem(CACHE_INDEX_KEY, JSON.stringify(nextIndex))

    return cached
  } catch {
    return null
  }
}
