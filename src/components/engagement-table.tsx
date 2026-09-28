"use client"

import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, UsersRoundIcon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { MetricSet, PersonEngagement } from "@/lib/substack/types"
import { initials } from "@/lib/initials"
import { cn } from "@/lib/utils"

export type ReportView = "combined" | "notes" | "articles"
type SortKey = "reader" | keyof MetricSet | "lastCommentAt" | "lastSignalAt"
type SortDirection = "asc" | "desc"
export const PAGE_SIZE = 20

const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "reader", label: "Reader" },
  { key: "score", label: "Score", numeric: true },
  { key: "total", label: "Total", numeric: true },
  { key: "likes", label: "Likes", numeric: true },
  { key: "comments", label: "Comments", numeric: true },
  { key: "restacks", label: "Restacks", numeric: true },
  { key: "lastCommentAt", label: "Last comment" },
  { key: "lastSignalAt", label: "Last signal" },
]

function formatDate(value: string | null) {
  if (!value) return "–"
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

function metricsFor(person: PersonEngagement, view: ReportView): MetricSet {
  if (view === "notes") return person.notes
  if (view === "articles") return person.articles
  return person.combined
}

interface EngagementTableProps {
  people: PersonEngagement[]
  view: ReportView
  page: number
  onPageChange: (page: number) => void
  isScanning?: boolean
}

interface EngagementPaginationProps {
  total: number
  page: number
  onPageChange: (page: number) => void
  position: "top" | "bottom"
}

export function EngagementPagination({ total, page, onPageChange, position }: EngagementPaginationProps) {
  const pageCount = Math.ceil(total / PAGE_SIZE)
  if (pageCount <= 1) return null

  return (
    <nav aria-label={`Leaderboard pagination ${position}`} className="flex flex-wrap items-center justify-between gap-3 text-sm">
      {position === "bottom" ? (
        <span className="text-muted-foreground">
          Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} profiles
        </span>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Previous page" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <span className="min-w-20 text-center tabular-nums" aria-live="polite">Page {page} of {pageCount}</span>
        <Button type="button" variant="outline" size="icon" aria-label="Next page" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}>
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>
    </nav>
  )
}

export function EngagementTable({ people, view, page, onPageChange, isScanning = false }: EngagementTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "score", direction: "desc" })
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>())
  const previousTops = useRef(new Map<number, number>())
  const visible = useMemo(() => people
    .filter((person) => metricsFor(person, view).total > 0)
    .sort((a, b) => {
      const aMetrics = metricsFor(a, view)
      const bMetrics = metricsFor(b, view)
      let comparison: number

      if (sort.key === "reader") comparison = a.name.localeCompare(b.name)
      else if (sort.key === "lastCommentAt" || sort.key === "lastSignalAt") {
        const aDate = a[sort.key]
        const bDate = b[sort.key]
        if (!aDate || !bDate) return aDate ? -1 : bDate ? 1 : 0
        comparison = aDate.localeCompare(bDate)
      } else comparison = aMetrics[sort.key] - bMetrics[sort.key]

      return (sort.direction === "asc" ? comparison : -comparison)
        || bMetrics.score - aMetrics.score
        || bMetrics.total - aMetrics.total
        || a.name.localeCompare(b.name)
    }), [people, view, sort])
  const pagePeople = useMemo(() => visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [visible, page])

  useLayoutEffect(() => {
    const nextTops = new Map<number, number>()
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    pagePeople.forEach((person, index) => {
      const row = rowRefs.current.get(person.id)
      if (!row) return
      row.getAnimations().forEach((animation) => animation.cancel())
      const top = row.offsetTop
      nextTops.set(person.id, top)
      if (!isScanning || reduceMotion || index >= 30) return

      const previousTop = previousTops.current.get(person.id)
      if (previousTop === undefined) {
        row.animate(
          [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 260, easing: "ease-out" },
        )
      } else if (Math.abs(previousTop - top) > 2) {
        row.animate(
          [{ transform: `translateY(${previousTop - top}px)` }, { transform: "translateY(0)" }],
          { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        )
      }
    })

    previousTops.current = nextTops
  }, [pagePeople, isScanning])

  if (visible.length === 0) {
    if (isScanning) {
      return (
        <div className="flex flex-col gap-4 py-5" role="status" aria-label="Waiting for reader results">
          <p className="text-sm text-muted-foreground">Readers will appear here as their activity is found.</p>
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-3 rounded-md border border-border/50 p-3" aria-hidden="true">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-40 max-w-full" />
                <Skeleton className="h-3 w-24 max-w-full" />
              </div>
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      )
    }
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersRoundIcon />
          </EmptyMedia>
          <EmptyTitle>No engagement found</EmptyTitle>
          <EmptyDescription>Try a longer date range or another report tab.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="space-y-4">
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map(({ key, label, numeric }) => {
            const active = sort.key === key
            const nextDirection = active && sort.direction === "asc" ? "descending" : "ascending"
            const SortIcon = active ? sort.direction === "asc" ? ArrowUpIcon : ArrowDownIcon : ArrowUpDownIcon
            return (
              <TableHead
                key={key}
                className={numeric ? "text-right" : undefined}
                aria-sort={active ? sort.direction === "asc" ? "ascending" : "descending" : "none"}
              >
                <button
                  type="button"
                  className={cn(
                    "inline-flex min-h-9 w-full items-center gap-1.5 rounded-sm text-left hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    numeric && "justify-end text-right",
                  )}
                  aria-label={`Sort by ${label}, ${nextDirection}`}
                  onClick={() => {
                    setSort((current) => ({
                      key,
                      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
                    }))
                    onPageChange(1)
                  }}
                >
                  {label}
                  <SortIcon className={cn("size-3.5 shrink-0", !active && "text-muted-foreground/70")} aria-hidden="true" />
                </button>
              </TableHead>
            )
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {pagePeople.map((person) => {
          const metrics = metricsFor(person, view)
          return (
            <TableRow
              key={person.id}
              ref={(node) => {
                if (node) rowRefs.current.set(person.id, node)
                else rowRefs.current.delete(person.id)
              }}
            >
              <TableCell>
                <a
                  href={person.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex min-w-52 items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Avatar className="size-9">
                    {person.photoUrl ? <AvatarImage src={person.photoUrl} alt="" /> : null}
                    <AvatarFallback>{initials(person.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium group-hover:underline group-focus-visible:underline">{person.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {person.handle ? `@${person.handle}` : person.writes ?? `ID ${person.id}`}
                    </p>
                  </div>
                </a>
              </TableCell>
              <TableCell className="text-right">
                <Badge variant="secondary">{metrics.score}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono">{metrics.total}</TableCell>
              <TableCell className="text-right font-mono">{metrics.likes}</TableCell>
              <TableCell className="text-right font-mono">{metrics.comments}</TableCell>
              <TableCell className="text-right font-mono">{metrics.restacks}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(person.lastCommentAt)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(person.lastSignalAt)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
    <EngagementPagination total={visible.length} page={page} onPageChange={onPageChange} position="bottom" />
    </div>
  )
}
