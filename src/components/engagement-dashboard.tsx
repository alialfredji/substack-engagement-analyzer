"use client"

import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIcon,
  DownloadIcon,
  FileTextIcon,
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
  FieldDescription,
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
  readCachedScan,
  readLatestCachedScan,
  saveCachedScan,
} from "@/lib/report-cache"
import { csvFilename, reportToCsv } from "@/lib/report-export"
import { cn } from "@/lib/utils"

const DEFAULT_INPUT: ScanInput = {
  profileUrl: "https://substack.com/@alialfredji",
  days: 14,
  requestsPerMinute: 40,
  concurrency: 4,
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
  const abortRef = useRef<AbortController | null>(null)
  const scanStartedAtRef = useRef<number | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const cached = readLatestCachedScan(window.localStorage)
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

  const runScan = async (forceRefresh = false) => {
    setError(null)
    setProgress(null)

    if (!forceRefresh) {
      const cached = readCachedScan(input, window.localStorage)
      if (cached) {
        setReport(cached.report)
        setReportState({ source: "cache", savedAt: cached.savedAt, cacheSaved: true })
        setView("combined")
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
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <RadarIcon aria-hidden="true" />
          <span className="text-sm font-medium">Signal Map</span>
        </div>
        <div className="flex max-w-3xl flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Find the people who keep showing up.
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Rank the readers engaging with a creator’s recent Notes and articles.
          </p>
        </div>
      </header>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>New scan</CardTitle>
          </CardHeader>
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
                  placeholder="https://substack.com/@creator"
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
                    max={90}
                    value={input.days}
                    onChange={(event) => setNumericInput("days", event.target.value)}
                  />
                  <FieldDescription>1-90</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="rpm">Requests per minute</FieldLabel>
                  <Input
                    id="rpm"
                    type="number"
                    min={10}
                    max={120}
                    value={input.requestsPerMinute}
                    onChange={(event) => setNumericInput("requestsPerMinute", event.target.value)}
                  />
                  <FieldDescription>10-120</FieldDescription>
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
                  <FieldDescription>1-8</FieldDescription>
                </Field>
              </FieldGroup>
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
  )
}
