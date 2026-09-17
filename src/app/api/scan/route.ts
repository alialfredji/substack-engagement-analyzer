import { scanEngagement } from "@/lib/substack/scanner"
import type { ScanInput, ScanStreamEvent } from "@/lib/substack/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 600

export async function POST(request: Request) {
  let input: ScanInput
  try {
    input = (await request.json()) as ScanInput
  } catch {
    return Response.json({ message: "The scan settings were not valid JSON." }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ScanStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      }

      void scanEngagement(input, {
        signal: request.signal,
        onProgress: (progress) => send({ type: "progress", progress }),
      })
        .then((result) => send({ type: "result", result }))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return
          send({
            type: "error",
            message: error instanceof Error ? error.message : "The scan could not be completed.",
          })
        })
        .finally(() => controller.close())
    },
  })

  return new Response(stream, {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/x-ndjson; charset=utf-8",
    },
  })
}
