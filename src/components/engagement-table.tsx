"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import { ExternalLinkIcon, UsersRoundIcon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
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
import { cn } from "@/lib/utils"

export type ReportView = "combined" | "notes" | "articles"

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
}

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
  isScanning?: boolean
}

export function EngagementTable({ people, view, isScanning = false }: EngagementTableProps) {
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>())
  const previousTops = useRef(new Map<number, number>())
  const visible = useMemo(() => people
    .filter((person) => metricsFor(person, view).total > 0)
    .sort((a, b) => {
      const aMetrics = metricsFor(a, view)
      const bMetrics = metricsFor(b, view)
      return bMetrics.score - aMetrics.score || bMetrics.total - aMetrics.total
    }), [people, view])

  useLayoutEffect(() => {
    const nextTops = new Map<number, number>()
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    visible.forEach((person, index) => {
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
  }, [visible, isScanning])

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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Reader</TableHead>
          <TableHead className="text-right">Score</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Likes</TableHead>
          <TableHead className="text-right">Comments</TableHead>
          <TableHead className="text-right">Restacks</TableHead>
          <TableHead>Last comment</TableHead>
          <TableHead>Last signal</TableHead>
          <TableHead className="text-right">Profile</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visible.map((person) => {
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
                <div className="flex min-w-52 items-center gap-3">
                  <Avatar className="size-9">
                    {person.photoUrl ? <AvatarImage src={person.photoUrl} alt="" /> : null}
                    <AvatarFallback>{initials(person.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{person.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {person.handle ? `@${person.handle}` : person.writes ?? `ID ${person.id}`}
                    </p>
                  </div>
                </div>
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
              <TableCell className="text-right">
                <a
                  href={person.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${person.name}'s Substack profile`}
                  className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
                >
                  <ExternalLinkIcon data-icon="inline-start" />
                </a>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
