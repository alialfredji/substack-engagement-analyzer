import type { Metadata } from "next"

import { EngagementDashboard } from "@/components/engagement-dashboard"

export const metadata: Metadata = {
  alternates: { canonical: "/" },
}

export default function Home() {
  return <EngagementDashboard />
}
