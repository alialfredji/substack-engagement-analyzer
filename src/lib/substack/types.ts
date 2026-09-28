export type ContentKind = "note" | "article"
export type EngagementKind = "like" | "comment" | "restack"

export interface ScanInput {
  profileUrl: string
  days: number
  requestsPerMinute: number
  concurrency: number
}

export interface TargetProfile {
  userId: number
  handle: string | null
  name: string
  photoUrl: string | null
  profileUrl: string
  publicationId: number | null
  publicationName: string | null
  publicationSubdomain: string | null
  publicationUrl: string | null
}

export interface MetricSet {
  likes: number
  comments: number
  restacks: number
  total: number
  score: number
}

export interface PersonEngagement {
  id: number
  name: string
  handle: string | null
  photoUrl: string | null
  profileUrl: string
  writes: string | null
  combined: MetricSet
  notes: MetricSet
  articles: MetricSet
  lastSignalAt: string | null
  lastCommentAt: string | null
}

export interface ScanCoverage {
  reportedLikes: number
  enumeratedLikes: number
  reportedRestacks: number
  enumeratedRestacks: number
  reportedComments: number
  enumeratedComments: number
}

export interface ScanStats {
  requests: number
  retries: number
  rateLimits: number
  notesScanned: number
  articlesScanned: number
  durationMs: number
}

export interface ScanReport {
  target: TargetProfile
  input: ScanInput
  generatedAt: string
  cutoffAt: string
  people: PersonEngagement[]
  coverage: ScanCoverage
  stats: ScanStats
  warnings: string[]
}

export interface ScanProgress {
  phase: "resolving" | "discovering" | "scanning" | "finalizing"
  message: string
  completed: number
  total: number
  requests: number
}

export type ScanStreamEvent =
  | { type: "progress"; progress: ScanProgress }
  | { type: "target"; target: TargetProfile }
  | { type: "people"; people: PersonEngagement[] }
  | { type: "result"; result: ScanReport }
  | { type: "error"; message: string }

export interface ActorIdentity {
  id: number
  name: string | null
  handle: string | null
  photoUrl: string | null
  writes: string | null
}

export interface EngagementEdge {
  actor: ActorIdentity
  kind: EngagementKind
  contentKind: ContentKind
  contentId: number
  signalAt: string | null
  isExactTime: boolean
}
