import { mapWithConcurrency, RequestScheduler } from "./rate-limiter"
import type {
  ActorIdentity,
  EngagementEdge,
  MetricSet,
  PersonEngagement,
  ScanCoverage,
  ScanInput,
  ScanProgress,
  ScanReport,
  TargetProfile,
} from "./types"

const ROOT = "https://substack.com"

interface ProfileResponse {
  id: number
  name?: string | null
  handle?: string | null
  photo_url?: string | null
  primaryPublication?: {
    id: number
    name?: string | null
    subdomain?: string | null
  } | null
}

interface FeedComment {
  id: number
  user_id?: number | null
  publication_id?: number | null
  name?: string | null
  handle?: string | null
  photo_url?: string | null
  date?: string | null
  body?: string | null
  reaction_count?: number | null
  restacks?: number | null
  children_count?: number | null
}

interface FeedItem {
  comment?: FeedComment | null
  context?: { timestamp?: string | null } | null
}

interface FeedPage {
  items?: FeedItem[]
  nextCursor?: string | null
}

interface ArchivePost {
  id: number
  publication_id: number
  slug: string
  title?: string | null
  post_date?: string | null
  reaction_count?: number | null
  restacks?: number | null
  comment_count?: number | null
  child_comment_count?: number | null
}

interface UpstreamActor {
  id: number
  name?: string | null
  handle?: string | null
  photo_url?: string | null
  writes?: string | null
  primary_publication?: { name?: string | null } | null
}

interface ReplyComment {
  id: number
  user_id?: number | null
  name?: string | null
  handle?: string | null
  photo_url?: string | null
  date?: string | null
  children?: ReplyComment[] | null
}

interface ReplyPage {
  commentBranches?: unknown[]
  automodHiddenBranches?: unknown[]
  nextCursor?: string | null
}

interface LegacyComments {
  comments?: ReplyComment[]
}

interface PublicationPreload {
  pub?: {
    id?: number
    name?: string | null
    subdomain?: string | null
    author_id?: number | null
    logo_url?: string | null
    contributors?: Array<{
      name?: string | null
      handle?: string | null
      user_id?: number | null
      photo_url?: string | null
      owner?: boolean
    }>
  }
}

interface NoteContent {
  kind: "note"
  id: number
  publicationId: number | null
  date: string
  reportedLikes: number
  reportedComments: number
  reportedRestacks: number
}

interface ArticleContent {
  kind: "article"
  id: number
  publicationId: number
  date: string
  reportedLikes: number
  reportedComments: number
  reportedRestacks: number
}

type ContentItem = NoteContent | ArticleContent

interface ScanDependencies {
  signal?: AbortSignal
  onProgress?: (progress: ScanProgress) => void
}

function clampInteger(value: number, minimum: number, maximum: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.round(value)))
}

export function normalizeInput(input: ScanInput): ScanInput {
  if (!input.profileUrl?.trim()) throw new Error("Add a Substack profile or publication link.")

  return {
    profileUrl: input.profileUrl.trim(),
    days: clampInteger(input.days, 1, 1_000_000, 14),
    requestsPerMinute: clampInteger(input.requestsPerMinute, 10, 60, 50),
    concurrency: clampInteger(input.concurrency, 1, 8, 4),
  }
}

export type ParsedTarget =
  | { type: "profile"; handle: string }
  | { type: "publication"; origin: string }

export function parseTargetUrl(value: string): ParsedTarget {
  const trimmed = value.trim()
  const directHandle = trimmed.match(/^@?([a-zA-Z0-9-]+)$/)
  if (directHandle) return { type: "profile", handle: directHandle[1] }

  let url: URL
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`)
  } catch {
    throw new Error("Use a valid Substack profile or publication link.")
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("Use an http or https Substack link.")
  }

  const handle = url.pathname.match(/^\/@([^/?#]+)/)?.[1]
  if (handle && /(^|\.)substack\.com$/i.test(url.hostname)) {
    return { type: "profile", handle }
  }

  return { type: "publication", origin: url.origin }
}

function parsePublicationPreload(html: string): PublicationPreload {
  const expression = /window\._preloads\s*=\s*JSON\.parse\(/g.exec(html)
  if (!expression) throw new Error("This page does not look like a public Substack publication.")

  const start = expression.index + expression[0].length
  const end = html.indexOf(")</script>", start)
  if (end < 0) throw new Error("Could not read this publication's public metadata.")

  try {
    return JSON.parse(JSON.parse(html.slice(start, end))) as PublicationPreload
  } catch {
    throw new Error("Could not read this publication's public metadata.")
  }
}

async function resolveTarget(
  parsed: ParsedTarget,
  scheduler: RequestScheduler,
): Promise<TargetProfile> {
  if (parsed.type === "profile") {
    const profile = await scheduler.json<ProfileResponse>(
      `${ROOT}/api/v1/user/${encodeURIComponent(parsed.handle)}/public_profile`,
    )
    const publication = profile.primaryPublication

    return {
      userId: profile.id,
      handle: profile.handle ?? parsed.handle,
      name: profile.name ?? profile.handle ?? parsed.handle,
      photoUrl: profile.photo_url ?? null,
      profileUrl: `${ROOT}/@${profile.handle ?? parsed.handle}`,
      publicationId: publication?.id ?? null,
      publicationName: publication?.name ?? null,
      publicationSubdomain: publication?.subdomain ?? null,
      publicationUrl: publication?.subdomain
        ? `https://${publication.subdomain}.substack.com`
        : null,
    }
  }

  const html = await scheduler.text(parsed.origin)
  const preload = parsePublicationPreload(html)
  const publication = preload.pub
  if (!publication?.id || !publication.author_id) {
    throw new Error("This publication did not expose a public owner profile.")
  }

  const owner =
    publication.contributors?.find((contributor) => contributor.owner) ??
    publication.contributors?.find((contributor) => contributor.user_id === publication.author_id) ??
    publication.contributors?.[0]
  const handle = owner?.handle ?? null

  return {
    userId: publication.author_id,
    handle,
    name: owner?.name ?? publication.name ?? "Substack creator",
    photoUrl: owner?.photo_url ?? publication.logo_url ?? null,
    profileUrl: handle ? `${ROOT}/@${handle}` : `${ROOT}/profile/${publication.author_id}`,
    publicationId: publication.id,
    publicationName: publication.name ?? null,
    publicationSubdomain: publication.subdomain ?? null,
    publicationUrl: publication.subdomain
      ? `https://${publication.subdomain}.substack.com`
      : parsed.origin,
  }
}

function validDate(value: string | null | undefined) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

async function discoverNotes(
  target: TargetProfile,
  cutoff: number,
  scheduler: RequestScheduler,
) {
  const notes = new Map<number, NoteContent>()
  let cursor: string | null = null
  const seenCursors = new Set<string>()

  for (let page = 0; page < 25; page += 1) {
    const params = new URLSearchParams()
    params.append("types[]", "note")
    if (cursor) params.set("cursor", cursor)

    const feed = await scheduler.json<FeedPage>(
      `${ROOT}/api/v1/reader/feed/profile/${target.userId}?${params}`,
    )
    const pageDates: number[] = []

    for (const item of feed.items ?? []) {
      const comment = item.comment
      const date = validDate(comment?.date ?? item.context?.timestamp)
      if (!comment?.id || !date || comment.user_id !== target.userId) continue

      const timestamp = new Date(date).getTime()
      pageDates.push(timestamp)
      if (timestamp < cutoff) continue

      notes.set(comment.id, {
        kind: "note",
        id: comment.id,
        publicationId: comment.publication_id ?? target.publicationId,
        date,
        reportedLikes: comment.reaction_count ?? 0,
        reportedComments: comment.children_count ?? 0,
        reportedRestacks: comment.restacks ?? 0,
      })
    }

    const nextCursor = feed.nextCursor ?? null
    const pageIsOlder = pageDates.length > 0 && pageDates.every((date) => date < cutoff)
    if (!nextCursor || seenCursors.has(nextCursor) || pageIsOlder) break
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }

  return [...notes.values()].sort((a, b) => b.date.localeCompare(a.date))
}

async function discoverArticles(
  target: TargetProfile,
  cutoff: number,
  scheduler: RequestScheduler,
) {
  if (!target.publicationSubdomain) return []

  const articles = new Map<number, ArticleContent>()
  const baseUrl = `https://${target.publicationSubdomain}.substack.com`
  let offset = 0

  for (let page = 0; page < 10; page += 1) {
    const posts = await scheduler.json<ArchivePost[]>(
      `${baseUrl}/api/v1/archive?sort=new&limit=50&offset=${offset}`,
    )
    if (!posts.length) break

    const datedPosts = posts
      .map((post) => ({ post, date: validDate(post.post_date) }))
      .filter((entry): entry is { post: ArchivePost; date: string } => Boolean(entry.date))

    for (const { post, date } of datedPosts) {
      if (new Date(date).getTime() < cutoff) continue
      articles.set(post.id, {
        kind: "article",
        id: post.id,
        publicationId: post.publication_id,
        date,
        reportedLikes: post.reaction_count ?? 0,
        reportedComments: post.comment_count ?? 0,
        reportedRestacks: post.restacks ?? 0,
      })
    }

    if (datedPosts.length > 0 && datedPosts.every(({ date }) => new Date(date).getTime() < cutoff)) {
      break
    }

    if (posts.length < 50) break
    offset += posts.length
  }

  return [...articles.values()].sort((a, b) => b.date.localeCompare(a.date))
}

function actorFromUpstream(actor: UpstreamActor): ActorIdentity | null {
  if (!Number.isFinite(actor.id)) return null
  return {
    id: actor.id,
    name: actor.name ?? null,
    handle: actor.handle ?? null,
    photoUrl: actor.photo_url ?? null,
    writes: actor.writes ?? actor.primary_publication?.name ?? null,
  }
}

function actorFromComment(comment: ReplyComment): ActorIdentity | null {
  if (!comment.user_id) return null
  return {
    id: comment.user_id,
    name: comment.name ?? null,
    handle: comment.handle ?? null,
    photoUrl: comment.photo_url ?? null,
    writes: null,
  }
}

function extractReplyComments(value: unknown, found = new Map<number, ReplyComment>()) {
  if (Array.isArray(value)) {
    for (const item of value) extractReplyComments(item, found)
    return found
  }
  if (!value || typeof value !== "object") return found

  const record = value as Record<string, unknown>
  if (
    typeof record.id === "number" &&
    (typeof record.user_id === "number" || record.user_id === null) &&
    ("date" in record || "body" in record)
  ) {
    found.set(record.id, record as unknown as ReplyComment)
  }

  for (const key of ["comment", "descendantComments", "children"]) {
    if (key in record) extractReplyComments(record[key], found)
  }
  return found
}

async function collectReplies(
  content: ContentItem,
  target: TargetProfile,
  scheduler: RequestScheduler,
  baseUrl: string,
) {
  const comments = new Map<number, ReplyComment>()
  const seenCursors = new Set<string>()
  let cursor: string | null = null

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams()
    params.set("publication_id", String(content.publicationId ?? target.publicationId ?? ""))
    if (content.kind === "note") params.set("comment_id", String(content.id))
    if (cursor) params.set("cursor", cursor)

    const path =
      content.kind === "note"
        ? `/api/v1/reader/comment/${content.id}/replies`
        : `/api/v1/reader/post/${content.id}/replies`
    const result = await scheduler.json<ReplyPage>(`${baseUrl}${path}?${params}`)
    extractReplyComments(result.commentBranches ?? [], comments)

    const nextCursor = result.nextCursor ?? null
    if (!nextCursor || seenCursors.has(nextCursor)) break
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }

  if (content.kind === "article" && comments.size === 0 && content.reportedComments > 0) {
    const legacy = await scheduler.json<LegacyComments>(
      `${baseUrl}/api/v1/post/${content.id}/comments?all_comments=true&sort=best_first`,
    )
    extractReplyComments(legacy.comments ?? [], comments)
  }

  return [...comments.values()]
}

function emptyCoverage(): ScanCoverage {
  return {
    reportedLikes: 0,
    enumeratedLikes: 0,
    reportedRestacks: 0,
    enumeratedRestacks: 0,
    reportedComments: 0,
    enumeratedComments: 0,
  }
}

function emptyMetrics(): MetricSet {
  return { likes: 0, comments: 0, restacks: 0, total: 0, score: 0 }
}

function addMetric(metrics: MetricSet, kind: EngagementEdge["kind"]) {
  if (kind === "like") metrics.likes += 1
  if (kind === "comment") metrics.comments += 1
  if (kind === "restack") metrics.restacks += 1
  metrics.total += 1
  metrics.score += kind === "comment" ? 3 : kind === "restack" ? 2 : 1
}

export function aggregateEngagements(edges: EngagementEdge[]): PersonEngagement[] {
  const people = new Map<number, PersonEngagement>()

  for (const edge of edges) {
    const existing = people.get(edge.actor.id)
    const person = existing ?? {
      id: edge.actor.id,
      name: edge.actor.name ?? "Substack reader",
      handle: edge.actor.handle,
      photoUrl: edge.actor.photoUrl,
      profileUrl: edge.actor.handle
        ? `${ROOT}/@${edge.actor.handle}`
        : `${ROOT}/profile/${edge.actor.id}`,
      writes: edge.actor.writes,
      combined: emptyMetrics(),
      notes: emptyMetrics(),
      articles: emptyMetrics(),
      lastSignalAt: null,
      lastCommentAt: null,
    }

    if (!person.handle && edge.actor.handle) {
      person.handle = edge.actor.handle
      person.profileUrl = `${ROOT}/@${edge.actor.handle}`
    }
    if (!person.photoUrl && edge.actor.photoUrl) person.photoUrl = edge.actor.photoUrl
    if (!person.writes && edge.actor.writes) person.writes = edge.actor.writes
    if (person.name === "Substack reader" && edge.actor.name) person.name = edge.actor.name

    addMetric(person.combined, edge.kind)
    addMetric(edge.contentKind === "note" ? person.notes : person.articles, edge.kind)

    if (edge.signalAt && (!person.lastSignalAt || edge.signalAt > person.lastSignalAt)) {
      person.lastSignalAt = edge.signalAt
    }
    if (
      edge.kind === "comment" &&
      edge.signalAt &&
      (!person.lastCommentAt || edge.signalAt > person.lastCommentAt)
    ) {
      person.lastCommentAt = edge.signalAt
    }

    people.set(person.id, person)
  }

  return [...people.values()].sort(
    (a, b) => b.combined.score - a.combined.score || b.combined.total - a.combined.total,
  )
}

export async function scanEngagement(
  unsafeInput: ScanInput,
  dependencies: ScanDependencies = {},
): Promise<ScanReport> {
  const startedAt = Date.now()
  const input = normalizeInput(unsafeInput)
  let retryMessage: string | null = null
  const scheduler = new RequestScheduler({
    requestsPerMinute: input.requestsPerMinute,
    concurrency: input.concurrency,
    signal: dependencies.signal,
    onRetry: (message) => {
      retryMessage = message
    },
  })
  const progress = (
    phase: ScanProgress["phase"],
    message: string,
    completed = 0,
    total = 0,
  ) =>
    dependencies.onProgress?.({
      phase,
      message: retryMessage ?? message,
      completed,
      total,
      requests: scheduler.stats.requests,
    })

  progress("resolving", "Resolving the creator and publication…")
  const target = await resolveTarget(parseTargetUrl(input.profileUrl), scheduler)
  const cutoff = Date.now() - input.days * 86_400_000

  progress("discovering", `Finding content from the last ${input.days} days…`)
  const [notes, articles] = await Promise.all([
    discoverNotes(target, cutoff, scheduler),
    discoverArticles(target, cutoff, scheduler),
  ])
  const content: ContentItem[] = [...notes, ...articles]
  const coverage = emptyCoverage()
  const edges: EngagementEdge[] = []
  const warnings = new Set<string>()
  let completed = 0

  progress(
    "scanning",
    `Found ${notes.length} notes and ${articles.length} articles. Scanning engagement…`,
    0,
    content.length,
  )

  await mapWithConcurrency(content, input.concurrency, async (item) => {
    const baseUrl =
      item.kind === "note"
        ? ROOT
        : `https://${target.publicationSubdomain}.substack.com`
    const actorPath = item.kind === "note" ? "comment" : "post"

    coverage.reportedLikes += item.reportedLikes
    coverage.reportedComments += item.reportedComments
    coverage.reportedRestacks += item.reportedRestacks

    const safe = async <T>(label: string, work: () => Promise<T>, fallback: T) => {
      try {
        return await work()
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        warnings.add(`${label}: ${message}`)
        return fallback
      }
    }

    const [reactors, restackers, comments] = await Promise.all([
      item.reportedLikes > 0
        ? safe(
            `${item.kind} ${item.id} likes`,
            () =>
              scheduler.json<UpstreamActor[]>(
                `${baseUrl}/api/v1/${actorPath}/${item.id}/reactors`,
              ),
            [],
          )
        : Promise.resolve([]),
      item.reportedRestacks > 0
        ? safe(
            `${item.kind} ${item.id} restacks`,
            () =>
              scheduler.json<UpstreamActor[]>(
                `${baseUrl}/api/v1/${actorPath}/${item.id}/restackers`,
              ),
            [],
          )
        : Promise.resolve([]),
      item.reportedComments > 0
        ? safe(
            `${item.kind} ${item.id} comments`,
            () => collectReplies(item, target, scheduler, baseUrl),
            [],
          )
        : Promise.resolve([]),
    ])

    const externalReactors = reactors.filter((actor) => actor.id !== target.userId)
    const externalRestackers = restackers.filter((actor) => actor.id !== target.userId)
    const externalComments = comments.filter((comment) => comment.user_id !== target.userId)

    coverage.enumeratedLikes += externalReactors.length
    coverage.enumeratedRestacks += externalRestackers.length
    coverage.enumeratedComments += externalComments.length

    for (const actor of externalReactors) {
      const identity = actorFromUpstream(actor)
      if (identity) {
        edges.push({
          actor: identity,
          kind: "like",
          contentKind: item.kind,
          contentId: item.id,
          signalAt: item.date,
          isExactTime: false,
        })
      }
    }
    for (const actor of externalRestackers) {
      const identity = actorFromUpstream(actor)
      if (identity) {
        edges.push({
          actor: identity,
          kind: "restack",
          contentKind: item.kind,
          contentId: item.id,
          signalAt: item.date,
          isExactTime: false,
        })
      }
    }
    for (const comment of externalComments) {
      const identity = actorFromComment(comment)
      if (identity) {
        edges.push({
          actor: identity,
          kind: "comment",
          contentKind: item.kind,
          contentId: item.id,
          signalAt: validDate(comment.date),
          isExactTime: true,
        })
      }
    }

    if (item.reportedComments > 0 && externalComments.length === 0) {
      warnings.add(
        "Some comment threads are visible only to signed-in or subscribed readers, so comment identities can be incomplete.",
      )
    }

    completed += 1
    retryMessage = null
    progress(
      "scanning",
      `Scanning engagement ${completed} of ${content.length}…`,
      completed,
      content.length,
    )
  })

  if (coverage.enumeratedLikes < coverage.reportedLikes) {
    warnings.add(
      "Substack's public reactor lists can contain fewer people than the displayed reaction totals.",
    )
  }
  if (coverage.enumeratedRestacks < coverage.reportedRestacks) {
    warnings.add(
      "Substack's public restacker lists can contain fewer people than the displayed restack totals.",
    )
  }

  progress("finalizing", "Ranking readers and preparing the report…", completed, content.length)

  return {
    target,
    input,
    generatedAt: new Date().toISOString(),
    cutoffAt: new Date(cutoff).toISOString(),
    people: aggregateEngagements(edges),
    coverage,
    stats: {
      ...scheduler.stats,
      notesScanned: notes.length,
      articlesScanned: articles.length,
      durationMs: Date.now() - startedAt,
    },
    warnings: [...warnings].slice(0, 12),
  }
}
