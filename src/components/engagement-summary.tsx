import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type EngagementTotals = {
  likes: number
  comments: number
  restacks: number
  total: number
}

const numberFormatter = new Intl.NumberFormat("en-US")

export function EngagementSummary({
  engagers,
  contentCount,
  totals,
}: {
  engagers: number
  contentCount: number
  totals: EngagementTotals
}) {
  const breakdown = [
    { label: "Likes", value: totals.likes, color: "bg-primary" },
    { label: "Comments", value: totals.comments, color: "bg-chart-2" },
    { label: "Restacks", value: totals.restacks, color: "bg-chart-3" },
  ]

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-labelledby="engagement-overview-title">
      <Card size="sm" className="col-span-2">
        <CardHeader>
          <CardTitle className="text-muted-foreground">Total engagements</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-5 text-4xl font-semibold tracking-tight tabular-nums sm:text-[2.75rem]">
            {numberFormatter.format(totals.total)}
          </p>
          <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {breakdown.map((item) => (
              <span
                key={item.label}
                className={item.color}
                style={{ width: `${totals.total ? (item.value / totals.total) * 100 : 0}%` }}
              />
            ))}
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 sm:gap-4">
            {breakdown.map((item) => (
              <div key={item.label} className="min-w-0">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn("size-1.5 shrink-0 rounded-[2px]", item.color)} aria-hidden="true" />
                  {item.label}
                </dt>
                <dd className="mt-1 pl-3 text-base font-semibold tabular-nums">
                  {numberFormatter.format(item.value)}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-muted-foreground">Engagers</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {numberFormatter.format(engagers)}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">People who interacted</p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-muted-foreground">Content scanned</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {numberFormatter.format(contentCount)}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">Notes and articles</p>
        </CardContent>
      </Card>

      <Card size="sm" className="col-span-2 lg:col-span-4 lg:flex-row lg:items-center">
        <CardHeader className="lg:w-[28%]">
          <CardTitle>Average per content</CardTitle>
          <p className="text-xs text-muted-foreground">
            Across {numberFormatter.format(contentCount)} notes and articles
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2 lg:flex-1 lg:gap-0">
          {breakdown.map((item, index) => (
            <dl key={item.label} className={index === 0 ? "" : "border-l border-border pl-3 sm:pl-6"}>
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
                {contentCount ? (item.value / contentCount).toFixed(1) : "0.0"}
              </dd>
            </dl>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}
