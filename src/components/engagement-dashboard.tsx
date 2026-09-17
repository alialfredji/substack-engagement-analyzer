"use client"

import { FormEvent, useMemo, useRef, useState } from "react"
import {
  ActivityIcon,
  FileTextIcon,
  RadarIcon,
  StickyNoteIcon,
  XIcon,
} from "lucide-react"

import { EngagementTable } from "@/components/engagement-table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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
import { cn } from "@/lib/utils"

const EXAMPLES = ["lidiyawrites", "alialfredji", "kevinszabo14"]

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

export function EngagementDashboard() {
  const [input, setInput] = useState(DEFAULT_INPUT)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [report, setReport] = useState<ScanReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const totalEngagements = useMemo(
    () => report?.people.reduce((sum, person) => sum + person.combined.total, 0) ?? 0,
    [report],
  )

  const setNumericInput = (key: "days" | "requestsPerMinute" | "concurrency", value: string) => {
    setInput((current) => ({ ...current, [key]: Number(value) }))
  }

  const runScan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setReport(null)
    setProgress(null)
    setIsScanning(true)

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
          if (message.type === "result") setReport(message.result)
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
      abortRef.current = null
      setIsScanning(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <RadarIcon aria-hidden="true" />
          <span className="text-sm font-medium">Signal Map</span>
          <Badge variant="secondary">Public data</Badge>
        </div>
        <div className="flex max-w-3xl flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Find the people who keep showing up.
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            Scan a Substack creator’s recent Notes and articles, then rank readers by likes,
            comments, and restacks.
          </p>
        </div>
      </header>

      <Card>
        <form onSubmit={runScan}>
          <CardHeader>
            <CardTitle>New engagement scan</CardTitle>
            <CardDescription>
              Profile and publication links both work. Two weeks is a useful default.
            </CardDescription>
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
                <FieldDescription className="flex flex-wrap items-center gap-1">
                  <span>Try</span>
                  {EXAMPLES.map((handle) => (
                      <Button
                        key={handle}
                        type="button"
                        variant="link"
                        size="xs"
                        onClick={() =>
                          setInput((current) => ({
                            ...current,
                            profileUrl: `https://substack.com/@${handle}`,
                          }))
                        }
                      >
                        @{handle}
                      </Button>
                  ))}
                </FieldDescription>
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
                  <FieldDescription>1–90 days</FieldDescription>
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
                  <FieldDescription>Start at 40; raise gradually.</FieldDescription>
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
                  <FieldDescription>Four is a safe default.</FieldDescription>
                </Field>
              </FieldGroup>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-between gap-3">
            <p className="hidden text-xs text-muted-foreground sm:block">
              Requests are globally paced even when work runs in parallel.
            </p>
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

      {isScanning && progress ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Spinner data-icon="inline-start" />
              Scan in progress
            </CardTitle>
            <CardDescription>{progress.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={progressValue(progress)}>
              <ProgressLabel>{progress.phase}</ProgressLabel>
              <ProgressValue>
                {(_formattedValue, value) => `${Math.round(value ?? 0)}%`}
              </ProgressValue>
            </Progress>
          </CardContent>
          <CardFooter>
            <p className="text-xs text-muted-foreground">
              {progress.requests} requests started
              {progress.total ? ` · ${progress.completed}/${progress.total} content items` : ""}
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

      {!report && !isScanning && !error ? (
        <Empty className="min-h-52 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ActivityIcon />
            </EmptyMedia>
            <EmptyTitle>Your report will appear here</EmptyTitle>
            <EmptyDescription>
              Results stay in this browser tab and link directly to each reader’s profile.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {report ? (
        <section className="flex flex-col gap-6" aria-labelledby="report-title">
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
                <p className="truncate text-sm text-muted-foreground">
                  {report.target.publicationName ?? report.target.handle ?? "Substack creator"} · last{" "}
                  {report.input.days} days
                </p>
              </div>
            </div>
            <a
              href={report.target.profileUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Open profile
            </a>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["People", report.people.length],
              ["Engagements", totalEngagements],
              ["Content scanned", report.stats.notesScanned + report.stats.articlesScanned],
              ["Requests", report.stats.requests],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle className="font-mono text-2xl">{value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          {report.warnings.length ? (
            <Alert>
              <AlertTitle>Public-data limits</AlertTitle>
              <AlertDescription>
                <ul className="flex list-disc flex-col gap-1 pl-4">
                  {report.warnings.slice(0, 3).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Engagement leaderboard</CardTitle>
              <CardDescription>
                Score: comment 3 · restack 2 · like 1. “Last signal” uses the content date when
                Substack does not expose the exact reaction time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="combined">
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
                {formatDuration(report.stats.durationMs)} · {report.stats.retries} retries ·{" "}
                {report.stats.rateLimits} rate limits
              </span>
            </CardFooter>
          </Card>
        </section>
      ) : null}
    </main>
  )
}
