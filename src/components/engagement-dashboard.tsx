"use client"

import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIcon,
  DownloadIcon,
  FileTextIcon,
  HistoryIcon,
  RadarIcon,
  RefreshCcwIcon,
  StickyNoteIcon,
  XIcon,
} from "lucide-react"

import { EngagementTable, type ReportView } from "@/components/engagement-table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  ScanInput,
  ScanProgress,
  ScanReport,
  ScanStreamEvent,
} from "@/lib/substack/types"
import {
  listCachedScans,
  readCachedScan,
  saveCachedScan,
  type CachedScan,
} from "@/lib/report-cache"
import { csvFilename, reportToCsv } from "@/lib/report-export"
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
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 4.73c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
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
  source: "cache" | "fresh"
  savedAt: string
  cacheSaved: boolean
}

export function EngagementDashboard() {
  const [input, setInput] = useState(DEFAULT_INPUT)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [report, setReport] = useState<ScanReport | null>(null)
  const [reportState, setReportState] = useState<ReportState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [view, setView] = useState<ReportView>("combined")
  const [cachedReports, setCachedReports] = useState<CachedScan[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const scanStartedAtRef = useRef<number | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedReports = listCachedScans(window.localStorage)
      setCachedReports(savedReports)
      const cached = savedReports[0]
      if (!cached) return

      setInput(cached.report.input)
      setReport(cached.report)
      setReportState({ source: "cache", savedAt: cached.savedAt, cacheSaved: true })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!isScanning || scanStartedAtRef.current === null) return

    const updateElapsed = () =>
      setElapsedMs(Date.now() - (scanStartedAtRef.current ?? Date.now()))
    updateElapsed()
    const timer = window.setInterval(updateElapsed, 1_000)

    return () => window.clearInterval(timer)
  }, [isScanning])

  const totalEngagements = useMemo(
    () => report?.people.reduce((sum, person) => sum + person.combined.total, 0) ?? 0,
    [report],
  )

  const setNumericInput = (key: "days" | "requestsPerMinute" | "concurrency", value: string) => {
    setInput((current) => ({ ...current, [key]: Number(value) }))
  }

  const openCachedReport = (cached: CachedScan) => {
    setInput(cached.report.input)
    setReport(cached.report)
    setReportState({ source: "cache", savedAt: cached.savedAt, cacheSaved: true })
    setView("combined")
    setError(null)
  }

  const runScan = async (forceRefresh = false) => {
    setError(null)
    setProgress(null)

    if (!forceRefresh) {
      const cached = readCachedScan(input, window.localStorage)
      if (cached) {
        openCachedReport(cached)
        return
      }
    }

    setReport(null)
    setReportState(null)
    setIsScanning(true)
    setElapsedMs(0)
    scanStartedAtRef.current = Date.now()

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

      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.trim()) continue
          const message = JSON.parse(line) as ScanStreamEvent
          if (message.type === "progress") setProgress(message.progress)
          if (message.type === "result") {
            const cached = saveCachedScan(message.result, window.localStorage)
            setCachedReports(listCachedScans(window.localStorage))
            setReport(message.result)
            setReportState({
              source: "fresh",
              savedAt: cached?.savedAt ?? message.result.generatedAt,
              cacheSaved: Boolean(cached),
            })
            setView("combined")
          }
          if (message.type === "error") throw new Error(message.message)
        }

        if (done) break
      }
    } catch (scanError) {
      if (scanError instanceof DOMException && scanError.name === "AbortError") {
        setError("Scan cancelled.")
      } else {
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
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="border-b border-border pb-6">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary" aria-hidden="true">
            <RadarIcon className="size-6" />
          </span>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Substack Engagers</h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              See who shows up for your writing across recent Notes and articles.
            </p>
          </div>
        </div>
      </header>

      <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <aside className="w-full shrink-0 lg:sticky lg:top-8 lg:w-72" aria-label="Saved reports">
        <Card size="sm" className="bg-sidebar">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HistoryIcon className="size-4 text-primary" aria-hidden="true" />
              Recent reports
            </CardTitle>
             <CardDescription>Saved on this browser{cachedReports.length ? ` · ${cachedReports.length}` : ""}</CardDescription>
          </CardHeader>
          <CardContent>
            {cachedReports.length ? (
               <nav aria-label="Recent reports" className="flex max-w-full gap-2 overflow-x-auto pb-1 lg:max-h-[65vh] lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:pr-1">
                {cachedReports.map((cached) => {
                  const active = report !== null && report.generatedAt === cached.report.generatedAt &&
                    report.input.profileUrl === cached.report.input.profileUrl

                  return (
                    <Button
                      key={`${cached.report.input.profileUrl}-${cached.report.input.days}`}
                      type="button"
                      variant={active ? "secondary" : "ghost"}
                       className="h-auto w-[85%] shrink-0 flex-col items-start gap-1 px-3 py-2 text-left sm:w-56 lg:w-full lg:min-w-0"
                      onClick={() => openCachedReport(cached)}
                      disabled={isScanning}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="w-full truncate font-medium">{cached.report.target.name}</span>
                      <span className="w-full truncate text-xs font-normal text-muted-foreground">
                        {formatDayRange(cached.report.input.days)} · {formatDateTime(cached.savedAt)}
                      </span>
                    </Button>
                  )
                })}
              </nav>
            ) : (
              <p className="text-sm text-muted-foreground">Your completed scans will appear here.</p>
            )}
           </CardContent>
        </Card>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-6">
      <Card>
        <form onSubmit={handleSubmit}>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="profile-url">Substack link</FieldLabel>
                <Input
                  id="profile-url"
                  type="url"
                  value={input.profileUrl}
                  onChange={(event) =>
                    setInput((current) => ({ ...current, profileUrl: event.target.value }))
                  }
                  placeholder="https://substack.com/@yourname"
                  required
                  aria-invalid={Boolean(error && !input.profileUrl)}
                />
              </Field>

              <FieldGroup className="grid grid-cols-1 md:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="days">Days to scan</FieldLabel>
                  <Input
                    id="days"
                    type="number"
                    min={1}
                    step={1}
                    value={input.days}
                    onChange={(event) => setNumericInput("days", event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rpm">Requests per minute</FieldLabel>
                  <Input
                    id="rpm"
                    type="number"
                    min={10}
                    max={60}
                    value={input.requestsPerMinute}
                    onChange={(event) => setNumericInput("requestsPerMinute", event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="concurrency">Parallel requests</FieldLabel>
                  <Input
                    id="concurrency"
                    type="number"
                    min={1}
                    max={8}
                    value={input.concurrency}
                    onChange={(event) => setNumericInput("concurrency", event.target.value)}
                  />
                </Field>
              </FieldGroup>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Scans use Substack&apos;s public APIs. Rate limits can slow a scan; use a lower request rate or fewer parallel requests if that happens.
              </p>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end">
            {isScanning ? (
              <Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}>
                <XIcon data-icon="inline-start" />
                Cancel scan
              </Button>
            ) : (
              <Button type="submit">
                <RadarIcon data-icon="inline-start" />
                Scan engagement
              </Button>
            )}
          </CardFooter>
        </form>
      </Card>

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

      {report ? (
        <section className="flex flex-col gap-4" aria-labelledby="report-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="size-12">
                {report.target.photoUrl ? <AvatarImage src={report.target.photoUrl} alt="" /> : null}
                <AvatarFallback>{initials(report.target.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h2 id="report-title" className="truncate text-xl font-semibold">
                  {report.target.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{report.target.publicationName ?? report.target.handle ?? "Substack creator"}</span>
                  <span>·</span>
                  <span>{formatDayRange(report.input.days)}</span>
                  <span>·</span>
                  <span>{formatDuration(report.stats.durationMs)}</span>
                  {reportState ? (
                    <Badge variant={reportState.source === "cache" ? "secondary" : "outline"}>
                      {reportState.source === "cache" ? "Cached" : reportState.cacheSaved ? "Saved" : "Not cached"}
                    </Badge>
                  ) : null}
                </div>
                {reportState ? (
                  <p className="text-xs text-muted-foreground">
                    {reportState.source === "cache" ? "Cached" : "Generated"} {formatDateTime(reportState.savedAt)}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void runScan(true)}>
                <RefreshCcwIcon data-icon="inline-start" />
                Rerun fresh
              </Button>
              <a
                href={report.target.profileUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Open profile
              </a>
            </div>
          </div>

          <Card size="sm">
            <CardHeader className="sr-only">
              <CardTitle>Scan summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {[
                  ["People", report.people.length],
                  ["Engagements", totalEngagements],
                  ["Content", report.stats.notesScanned + report.stats.articlesScanned],
                  ["Requests", report.stats.requests],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-1">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="text-xl font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          {report.warnings.length ? (
            <Alert>
              <AlertTitle>Public data</AlertTitle>
              <AlertDescription>
                Some reaction and restack totals may not expose every profile.
              </AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Engagement leaderboard</CardTitle>
              <CardAction>
                <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
                  <DownloadIcon data-icon="inline-start" />
                  Export CSV
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <Tabs value={view} onValueChange={(value) => setView(value as ReportView)}>
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
                <Separator />
                <TabsContent value="combined">
                  <EngagementTable people={report.people} view="combined" />
                </TabsContent>
                <TabsContent value="notes">
                  <EngagementTable people={report.people} view="notes" />
                </TabsContent>
                <TabsContent value="articles">
                  <EngagementTable people={report.people} view="articles" />
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter className="justify-between gap-4 text-xs text-muted-foreground">
              <span>
                {report.stats.notesScanned} notes · {report.stats.articlesScanned} articles
              </span>
              <span>
                {report.stats.retries} retries · {report.stats.rateLimits} rate limits
              </span>
            </CardFooter>
          </Card>
        </section>
      ) : null}
      </main>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
        <span>
          Built by <a href={CREATOR_URL} target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-2">Ali Alfredji</a> · Independent project, not affiliated with Substack.
        </span>
        <div className="flex items-center gap-3">
          <a href={PUBLICATION_URL} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">Modern Builder on Substack</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="View source on GitHub" className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "text-foreground")}>
            <GithubMark />
          </a>
        </div>
      </footer>
    </div>
  )
}
