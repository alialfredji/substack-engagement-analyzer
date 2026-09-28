"use client"

import { useState } from "react"
import { ChevronDownIcon, HistoryIcon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { CachedScan } from "@/lib/report-cache"
import type { ScanReport } from "@/lib/substack/types"
import { initials } from "@/lib/initials"
import { cn } from "@/lib/utils"

const VISIBLE_COUNT = 3

function savedAtLabel(value: string) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const day = date.toDateString() === today.toDateString()
    ? "Today"
    : date.toDateString() === yesterday.toDateString()
      ? "Yesterday"
      : new Intl.DateTimeFormat("en", {
          month: "short",
          day: "numeric",
          ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
        }).format(date)
  const time = new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(date)

  return `${day}, ${time}`
}

function dayRange(days: number) {
  return `${days} ${days === 1 ? "day" : "days"}`
}

function isSelected(cached: CachedScan, report: ScanReport | null) {
  return report !== null &&
    report.generatedAt === cached.report.generatedAt &&
    report.input.profileUrl === cached.report.input.profileUrl &&
    report.input.days === cached.report.input.days
}

function ReportRow({
  cached,
  selected,
  disabled,
  onOpen,
}: {
  cached: CachedScan
  selected: boolean
  disabled: boolean
  onOpen: (cached: CachedScan) => void
}) {
  const name = cached.report.target.name

  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "relative h-auto min-h-16 w-full min-w-0 justify-start gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left whitespace-normal hover:bg-muted",
        selected && "border-border bg-secondary hover:bg-secondary before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-primary",
      )}
      onClick={() => onOpen(cached)}
      disabled={disabled}
      aria-current={selected ? "true" : undefined}
      title={`${name} · ${dayRange(cached.report.input.days)} · ${savedAtLabel(cached.savedAt)}`}
    >
      <Avatar className="size-9 rounded-lg after:rounded-lg" aria-hidden="true">
        {cached.report.target.photoUrl ? (
          <AvatarImage className="rounded-lg" src={cached.report.target.photoUrl} alt="" />
        ) : null}
        <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-foreground">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="w-full truncate text-sm font-semibold">{name}</span>
        <span className="flex w-full min-w-0 items-center gap-1.5 text-xs font-normal text-muted-foreground">
          <span className="shrink-0 text-foreground">{dayRange(cached.report.input.days)}</span>
          <span className="truncate before:mr-1.5 before:content-['·']">{savedAtLabel(cached.savedAt)}</span>
        </span>
      </span>
    </Button>
  )
}

export function RecentReports({
  reports,
  activeReport,
  disabled,
  onOpen,
}: {
  reports: CachedScan[]
  activeReport: ScanReport | null
  disabled: boolean
  onOpen: (cached: CachedScan) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const recent = reports.slice(0, VISIBLE_COUNT)
  const older = reports.slice(VISIBLE_COUNT)
  const selectedOlder = older.find((cached) => isSelected(cached, activeReport))
  const shownOlder = expanded ? older : selectedOlder ? [selectedOlder] : []
  const hiddenCount = older.length - shownOlder.length

  return (
    <Card size="sm" className="bg-sidebar">
      <CardHeader className="px-4 pb-1">
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon className="size-4 text-primary" aria-hidden="true" />
          Recent reports
        </CardTitle>
        {reports.length > 0 ? (
          <CardAction>
            <Badge variant="outline" className="h-6 min-w-6 rounded-md px-1.5 text-xs text-muted-foreground">
              <span className="sr-only">Saved reports: </span>{reports.length}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="px-2">
        {reports.length > 0 ? (
          <nav aria-label="Saved reports" className="flex flex-col gap-0.5 lg:max-h-[65vh] lg:overflow-y-auto">
            {recent.map((cached) => (
              <ReportRow
                key={`${cached.report.input.profileUrl}-${cached.report.input.days}`}
                cached={cached}
                selected={isSelected(cached, activeReport)}
                disabled={disabled}
                onOpen={onOpen}
              />
            ))}
            {shownOlder.length > 0 ? (
              <p className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {expanded ? "Earlier" : "Selected from earlier"}
              </p>
            ) : null}
            {shownOlder.map((cached) => (
              <ReportRow
                key={`${cached.report.input.profileUrl}-${cached.report.input.days}`}
                cached={cached}
                selected={isSelected(cached, activeReport)}
                disabled={disabled}
                onOpen={onOpen}
              />
            ))}
          </nav>
        ) : (
          <p className="px-2 py-2 text-sm text-muted-foreground">Your completed scans will appear here.</p>
        )}
      </CardContent>
      {older.length > 0 ? (
        <CardFooter className="bg-transparent px-3 py-1.5">
          <Button
            type="button"
            variant="ghost"
            className="min-h-10 w-full justify-between px-2 text-xs"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "Show fewer reports" : `Show ${hiddenCount} older ${hiddenCount === 1 ? "report" : "reports"}`}
            <ChevronDownIcon data-icon="inline-end" className={cn("transition-transform motion-reduce:transition-none", expanded && "rotate-180")} />
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}
