import { ExternalLinkIcon, UsersRoundIcon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
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
  if (!value) return "—"
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
}

export function EngagementTable({ people, view }: EngagementTableProps) {
  const visible = people
    .filter((person) => metricsFor(person, view).total > 0)
    .sort((a, b) => {
      const aMetrics = metricsFor(a, view)
      const bMetrics = metricsFor(b, view)
      return bMetrics.score - aMetrics.score || bMetrics.total - aMetrics.total
    })

  if (visible.length === 0) {
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
            <TableRow key={person.id}>
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
