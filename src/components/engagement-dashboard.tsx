"use client"

import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIcon,
  DownloadIcon,
  FileTextIcon,
  RefreshCcwIcon,
  Share2Icon,
  StickyNoteIcon,
} from "lucide-react"

import { EngagementPagination, EngagementTable, PAGE_SIZE, type ReportView } from "@/components/engagement-table"
import { EngagementSummary } from "@/components/engagement-summary"
import { RecentReports } from "@/components/recent-reports"
import { ScanForm, rangeSelectionForDays, type RangeSelection } from "@/components/scan-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  ScanInput,
  ScanProgress,
  ScanReport,
  ScanStreamEvent,
  PersonEngagement,
  TargetProfile,
} from "@/lib/substack/types"
import {
  listCachedScans,
  readCachedScan,
  saveCachedScan,
  type CachedScan,
} from "@/lib/report-cache"
import { csvFilename, reportToCsv } from "@/lib/report-export"
import { trackEvent } from "@/lib/analytics"
import { initials } from "@/lib/initials"
import { cn } from "@/lib/utils"

const DEFAULT_INPUT: ScanInput = {
  profileUrl: "",
  days: 14,
  requestsPerMinute: 50,
  concurrency: 4,
}

const PUBLICATION_URL = "https://alialf.substack.com"
const CREATOR_URL = "https://substack.com/@alialfredji"
const GITHUB_URL = "https://github.com/alialfredji/substack-engagement-analyzer"

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="size-4" aria-hidden="true">
      <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
    </svg>
  )
}

function progressValue(progress: ScanProgress | null) {
  if (!progress) return 0
  if (progress.phase === "resolving") return 7
  if (progress.phase === "discovering") return 15
  if (progress.phase === "finalizing") return 96
  if (!progress.total) return 20
  return Math.min(92, 20 + Math.round((progress.completed / progress.total) * 72))
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 60_000) return `${Math.round(milliseconds / 1_000)}s`
  return `${Math.floor(milliseconds / 60_000)}m ${Math.round((milliseconds % 60_000) / 1_000)}s`
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatDayRange(days: number) {
  return `${days} ${days === 1 ? "day" : "days"}`
}

interface ReportState {
  source: "cache" | "fresh" | "shared"
  savedAt: string
}

export function EngagementDashboard({
  initialReport = null,
  initialSharePath = null,
}: {
  initialReport?: ScanReport | null
  initialSharePath?: string | null
}) {
  const [input, setInput] = useState(initialReport?.input ?? DEFAULT_INPUT)
  const [rangeSelection, setRangeSelection] = useState<RangeSelection>(
    rangeSelectionForDays(initialReport?.input.days ?? DEFAULT_INPUT.days),
  )
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [report, setReport] = useState<ScanReport | null>(initialReport)
  const [sharePath, setSharePath] = useState<string | null>(initialSharePath)
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)
  const [liveTarget, setLiveTarget] = useState<TargetProfile | null>(null)
  const [livePeople, setLivePeople] = useState<PersonEngagement[]>([])
  const [liveInput, setLiveInput] = useState<ScanInput | null>(null)
  const [reportState, setReportState] = useState<ReportState | null>(initialReport ? {
    source: "shared",
    savedAt: initialReport.generatedAt,
  } : null)
  const [error, setError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [view, setView] = useState<ReportView>("combined")
  const [page, setPage] = useState(1)
  const [cachedReports, setCachedReports] = useState<CachedScan[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const scanStartedAtRef = useRef<number | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedReports = listCachedScans(window.localStorage)
      setCachedReports(savedReports)
      if (initialReport) return
      const cached = savedReports[0]
      if (!cached) return

      setInput(cached.report.input)
      setRangeSelection(rangeSelectionForDays(cached.report.input.days))
      setReport(cached.report)
      setSharePath(cached.sharePath ?? null)
      setReportState({ source: "cache", savedAt: cached.savedAt })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [initialReport])

  useEffect(() => {
    if (!isScanning || scanStartedAtRef.current === null) return

    const updateElapsed = () =>
      setElapsedMs(Date.now() - (scanStartedAtRef.current ?? Date.now()))
    updateElapsed()
    const timer = window.setInterval(updateElapsed, 1_000)

    return () => window.clearInterval(timer)
  }, [isScanning])

  const displayedTarget = report?.target ?? liveTarget
  const displayedPeople = report?.people ?? livePeople
  const visibleCount = displayedPeople.filter((person) => person[view].total > 0).length
  const currentPage = Math.max(1, Math.min(page, Math.ceil(visibleCount / PAGE_SIZE)))
  const displayedInput = report?.input ?? liveInput
  const engagementTotals = useMemo(
    () => displayedPeople.reduce(
      (totals, person) => ({
        likes: totals.likes + person.combined.likes,
        comments: totals.comments + person.combined.comments,
        restacks: totals.restacks + person.combined.restacks,
        total: totals.total + person.combined.total,
      }),
      { likes: 0, comments: 0, restacks: 0, total: 0 },
    ),
    [displayedPeople],
  )
  const contentCount = report
    ? report.stats.notesScanned + report.stats.articlesScanned
    : progress?.completed ?? 0

  const openCachedReport = (cached: CachedScan) => {
    setLiveTarget(null)
    setLivePeople([])
    setLiveInput(null)
    setInput(cached.report.input)
    setRangeSelection(rangeSelectionForDays(cached.report.input.days))
    setReport(cached.report)
    setSharePath(cached.sharePath ?? null)
    setShareFeedback(null)
    setReportState({ source: "cache", savedAt: cached.savedAt })
    setView("combined")
    setPage(1)
    setError(null)
  }

  const runScan = async (forceRefresh = false) => {
    setError(null)
    setProgress(null)

    if (!forceRefresh) {
      const cached = readCachedScan(input, window.localStorage)
      if (cached) {
        openCachedReport(cached)
        trackEvent("cached_report_opened")
        return
      }
    }

    setReport(null)
    setSharePath(null)
    setShareFeedback(null)
    setReportState(null)
    setLiveTarget(null)
    setLivePeople([])
    setLiveInput({ ...input })
    setView("combined")
    setPage(1)
    setIsScanning(true)
    setElapsedMs(0)
    scanStartedAtRef.current = Date.now()
    trackEvent("scan_started", { days: input.days })

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(payload?.message ?? "The scan could not start.")
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let receivedResult = false

      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.trim()) continue
          const message = JSON.parse(line) as ScanStreamEvent
          if (message.type === "progress") setProgress(message.progress)
          if (message.type === "target") setLiveTarget(message.target)
          if (message.type === "people") {
            setLivePeople((current) => {
              const byId = new Map(current.map((person) => [person.id, person]))
              for (const person of message.people) byId.set(person.id, person)
              return [...byId.values()]
            })
          }
          if (message.type === "result") {
            receivedResult = true
            trackEvent("scan_completed", {
              days: message.result.input.days,
              people_found: message.result.people.length,
              duration_seconds: Math.round((Date.now() - (scanStartedAtRef.current ?? Date.now())) / 1_000),
            })
            const cached = saveCachedScan(message.result, window.localStorage, message.sharePath)
            setCachedReports(listCachedScans(window.localStorage))
            setReport(message.result)
            setSharePath(message.sharePath)
            setReportState({
              source: "fresh",
              savedAt: cached?.savedAt ?? message.result.generatedAt,
            })
            setView("combined")
            setPage(1)
          }
          if (message.type === "error") throw new Error(message.message)
        }

        if (done) break
      }
      if (!receivedResult) {
        if (controller.signal.aborted) throw new DOMException("Scan cancelled", "AbortError")
        throw new Error("The scan ended before the report was complete.")
      }
    } catch (scanError) {
      if (scanError instanceof DOMException && scanError.name === "AbortError") {
        trackEvent("scan_cancelled")
        setError("Scan cancelled.")
      } else {
        trackEvent("scan_failed")
        setError(scanError instanceof Error ? scanError.message : "The scan failed.")
      }
    } finally {
      if (scanStartedAtRef.current !== null) {
        setElapsedMs(Date.now() - scanStartedAtRef.current)
      }
      scanStartedAtRef.current = null
      abortRef.current = null
      setIsScanning(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void runScan(false)
  }

  const exportCsv = () => {
    if (!report) return

    const blob = new Blob([reportToCsv(report, view)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = csvFilename(report, view)
    document.body.appendChild(anchor)
    anchor.click()
    trackEvent("csv_exported", { view })
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const shareReport = async () => {
    if (!report || !sharePath) return
    const url = new URL(sharePath, window.location.origin).toString()
    try {
      if (navigator.share) {
        await navigator.share({ title: `${report.target.name} · Substack Engagers`, url })
        setShareFeedback("Shared")
      } else {
        await navigator.clipboard.writeText(url)
        setShareFeedback("Link copied")
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setShareFeedback("Could not share. Copy the page URL instead.")
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="border-b border-border pb-5">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Substack Engagers</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">
          See who engages with your recent Notes and articles.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground">
          <span>
            Made by <a href={CREATOR_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center font-medium text-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Ali Alfredji</a>
          </span>
          <span className="inline-flex items-center gap-2.5">
            <span aria-hidden="true">·</span>
            <a href={PUBLICATION_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center font-medium text-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Read Modern Builder</a>
          </span>
          <span className="inline-flex items-center gap-2.5">
            <span aria-hidden="true">·</span>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center gap-1 font-medium text-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <GithubMark />
              GitHub
            </a>
          </span>
        </div>
      </header>

      <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <aside className="w-full shrink-0 lg:sticky lg:top-8 lg:w-72" aria-label="Saved reports">
        <RecentReports
          reports={cachedReports}
          activeReport={report}
          disabled={isScanning}
          onOpen={openCachedReport}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-6">
      <ScanForm
        input={input}
        rangeSelection={rangeSelection}
        isScanning={isScanning}
        onInputChange={setInput}
        onRangeSelectionChange={setRangeSelection}
        onSubmit={handleSubmit}
        onCancel={() => abortRef.current?.abort()}
      />

      {isScanning ? (
        <Card>
          <CardHeader>
            <CardTitle>Scan in progress</CardTitle>
            <CardDescription>{progress?.message ?? "Starting scan"}</CardDescription>
            <CardAction>
              <Badge variant="secondary">
                <Spinner data-icon="inline-start" />
                {formatDuration(elapsedMs)}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Progress value={progressValue(progress)}>
              <ProgressLabel>{progress?.phase ?? "starting"}</ProgressLabel>
              <ProgressValue>
                {(_formattedValue, value) => `${Math.round(value ?? 0)}%`}
              </ProgressValue>
            </Progress>
          </CardContent>
          <CardFooter>
            <p className="text-xs text-muted-foreground">
              {progress?.requests ?? 0} requests
              {progress?.total ? ` · ${progress.completed}/${progress.total} items` : ""}
            </p>
          </CardFooter>
        </Card>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Scan stopped</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {report || isScanning || livePeople.length > 0 ? (
        <section className="flex flex-col gap-4" aria-labelledby="report-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <a
              href={displayedTarget?.profileUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "group flex min-w-0 items-center gap-3 rounded-sm",
                displayedTarget && "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              {displayedTarget ? (
                <Avatar className="size-12">
                  {displayedTarget.photoUrl ? <AvatarImage src={displayedTarget.photoUrl} alt="" /> : null}
                  <AvatarFallback>{initials(displayedTarget.name)}</AvatarFallback>
                </Avatar>
              ) : <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted"><Spinner className="size-5" /></span>}
              <div className="min-w-0">
                <h2 id="report-title" className="truncate text-xl font-semibold group-hover:underline group-focus-visible:underline">
                  {displayedTarget?.name ?? "Finding creator…"}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{displayedTarget?.publicationName ?? displayedTarget?.handle ?? "Substack creator"}</span>
                  <span>·</span>
                  <span>{formatDayRange(displayedInput?.days ?? input.days)}</span>
                </div>
                {reportState ? (
                  <p className="text-xs text-muted-foreground">
                    Generated {formatDateTime(reportState.savedAt)}
                  </p>
                ) : null}
              </div>
            </a>
            <div className="flex flex-wrap items-center gap-2">
              {report && sharePath ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void shareReport()}>
                  <Share2Icon data-icon="inline-start" />
                  Share
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={() => void runScan(true)} disabled={isScanning}>
                <RefreshCcwIcon data-icon="inline-start" />
                Rerun
              </Button>
            </div>
          </div>
          <EngagementSummary engagers={displayedPeople.length} contentCount={contentCount} totals={engagementTotals} />

          <Card key={report?.generatedAt ?? "live"}>
            <CardHeader>
              <CardTitle>Engagement leaderboard</CardTitle>
              <CardDescription aria-live="polite">
                {isScanning ? `${displayedPeople.length} readers found so far · rankings update as content is scanned` : report ? `${displayedPeople.length} readers ranked` : "Partial scan results"}
              </CardDescription>
              <CardAction>
                <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={!report || isScanning}>
                  <DownloadIcon data-icon="inline-start" />
                  Export CSV
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <Tabs value={view} onValueChange={(value) => {
                setView(value as ReportView)
                setPage(1)
              }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <TabsList variant="line">
                    <TabsTrigger value="combined">
                      <ActivityIcon data-icon="inline-start" />
                      Combined
                    </TabsTrigger>
                    <TabsTrigger value="notes">
                      <StickyNoteIcon data-icon="inline-start" />
                      Notes
                    </TabsTrigger>
                    <TabsTrigger value="articles">
                      <FileTextIcon data-icon="inline-start" />
                      Articles
                    </TabsTrigger>
                  </TabsList>
                  <EngagementPagination total={visibleCount} page={currentPage} onPageChange={setPage} position="top" />
                </div>
                <Separator />
                <TabsContent value="combined">
                  <EngagementTable people={displayedPeople} view="combined" page={currentPage} onPageChange={setPage} isScanning={isScanning} />
                </TabsContent>
                <TabsContent value="notes">
                  <EngagementTable people={displayedPeople} view="notes" page={currentPage} onPageChange={setPage} isScanning={isScanning} />
                </TabsContent>
                <TabsContent value="articles">
                  <EngagementTable people={displayedPeople} view="articles" page={currentPage} onPageChange={setPage} isScanning={isScanning} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </section>
      ) : null}
      </main>
      </div>
    </div>
  )
}
