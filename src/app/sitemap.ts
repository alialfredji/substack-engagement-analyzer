import type { MetadataRoute } from "next"

import { listReportPaths } from "../lib/report-store"
import { SITE_URL } from "../lib/site"

export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const reports = await listReportPaths()
  return [
    { url: SITE_URL },
    ...reports.map((report) => ({
      url: `${SITE_URL}${report.path}`,
      lastModified: report.date,
    })),
  ]
}
