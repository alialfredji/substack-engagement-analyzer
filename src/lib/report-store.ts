import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import type { ScanReport } from "@/lib/substack/types"

const reportsDirectory = process.env.REPORTS_DIR ?? path.join(process.cwd(), "data", "reports")
const handlePattern = /^[a-z0-9][a-z0-9_-]{0,79}$/
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const idPattern = /^[0-9a-f-]{36}$/

function reportHandle(report: ScanReport) {
  const handle = report.target.handle?.replace(/^@/, "").toLowerCase()
  return handle && handlePattern.test(handle) ? handle : `user-${report.target.userId}`
}

export function reportPath(handle: string, date: string, id: string) {
  return `/r/${handle}/${date}/${id}`
}

export async function saveReport(report: ScanReport) {
  const handle = reportHandle(report)
  const date = report.generatedAt.slice(0, 10)
  if (!datePattern.test(date)) throw new Error("The scan date is invalid.")

  const id = randomUUID()
  const directory = path.join(/*turbopackIgnore: true*/ reportsDirectory, handle, date)
  const destination = path.join(directory, `${id}.json`)
  const temporary = path.join(directory, `.${id}.tmp`)
  await mkdir(directory, { recursive: true })
  await writeFile(temporary, JSON.stringify(report), { flag: "wx" })
  await rename(temporary, destination)
  return reportPath(handle, date, id)
}

export async function readReport(handle: string, date: string, id: string): Promise<ScanReport | null> {
  if (!handlePattern.test(handle) || !datePattern.test(date) || !idPattern.test(id)) return null

  try {
    const contents = await readFile(path.join(/*turbopackIgnore: true*/ reportsDirectory, handle, date, `${id}.json`), "utf8")
    const report = JSON.parse(contents) as ScanReport
    return report?.target && Array.isArray(report.people) ? report : null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}
