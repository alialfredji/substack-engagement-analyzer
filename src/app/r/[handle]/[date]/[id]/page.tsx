import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { EngagementDashboard } from "@/components/engagement-dashboard"
import { readReport, reportPath } from "@/lib/report-store"
import { SITE_URL } from "@/lib/site"

export const dynamic = "force-dynamic"

type Params = Promise<{ handle: string; date: string; id: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { handle, date, id } = await params
  const report = await readReport(handle, date, id)
  if (!report) return { title: "Report not found" }

  return {
    title: `${report.target.name} · Substack Engagers`,
    description: `See the engagement report for ${report.target.name}, generated ${date}.`,
    alternates: { canonical: `${SITE_URL}${reportPath(handle, date, id)}` },
  }
}

export default async function SharedReportPage({ params }: { params: Params }) {
  const { handle, date, id } = await params
  const report = await readReport(handle, date, id)
  if (!report) notFound()

  return <EngagementDashboard initialReport={report} initialSharePath={reportPath(handle, date, id)} />
}
