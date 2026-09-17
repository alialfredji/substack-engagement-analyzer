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
  const scanController = new AbortController()
  let streamClosed = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const abortScan = () => scanController.abort()
      request.signal.addEventListener("abort", abortScan, { once: true })

      const send = (event: ScanStreamEvent) => {
        if (streamClosed || scanController.signal.aborted) return

        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          streamClosed = true
          scanController.abort()
        }
      }

      void scanEngagement(input, {
        signal: scanController.signal,
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
        .finally(() => {
          request.signal.removeEventListener("abort", abortScan)
          if (streamClosed) return

          streamClosed = true
          try {
            controller.close()
          } catch {
            // The browser may have already cancelled the response stream.
          }
        })
    },
    cancel() {
      streamClosed = true
      scanController.abort()
    },
  })

  return new Response(stream, {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/x-ndjson; charset=utf-8",
    },
  })
}
