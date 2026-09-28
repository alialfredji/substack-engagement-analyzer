type AnalyticsEvent =
  | "scan_started"
  | "scan_completed"
  | "scan_cancelled"
  | "scan_failed"
  | "cached_report_opened"
  | "csv_exported"

type EventParameters = Record<string, string | number | boolean>

declare global {
  interface Window {
    gtag?: (command: "event", name: string, parameters?: EventParameters) => void
  }
}

export function trackEvent(name: AnalyticsEvent, parameters?: EventParameters) {
  if (typeof window === "undefined") return
  window.gtag?.("event", name, parameters)
}
