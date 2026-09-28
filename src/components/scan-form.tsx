"use client"

import { FormEvent, useRef } from "react"
import { ChevronDownIcon, InfoIcon, LinkIcon, RadarIcon, Settings2Icon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { ScanInput } from "@/lib/substack/types"

export type RangeSelection = 7 | 14 | 30 | "custom"

export function rangeSelectionForDays(days: number): RangeSelection {
  return days === 7 || days === 14 || days === 30 ? days : "custom"
}

export function ScanForm({
  input,
  rangeSelection,
  isScanning,
  onInputChange,
  onRangeSelectionChange,
  onSubmit,
  onCancel,
}: {
  input: ScanInput
  rangeSelection: RangeSelection
  isScanning: boolean
  onInputChange: (input: ScanInput) => void
  onRangeSelectionChange: (selection: RangeSelection) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}) {
  const settingsRef = useRef<HTMLDetailsElement>(null)
  const setInput = (change: Partial<ScanInput>) => onInputChange({ ...input, ...change })
  const settingsSummary = `${input.requestsPerMinute} per minute, ${input.concurrency} at once`

  return (
    <Card>
      <form onSubmit={onSubmit} onInvalidCapture={(event) => {
        if (event.target instanceof HTMLInputElement && (event.target.id === "rpm" || event.target.id === "concurrency")) {
          if (settingsRef.current) settingsRef.current.open = true
        }
      }}>
        <CardContent>
          <FieldGroup className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.9fr)] xl:gap-6">
            <Field className="min-w-0">
              <FieldLabel htmlFor="profile-url">Substack profile link</FieldLabel>
              <div className="relative">
                <LinkIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="profile-url"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  className="h-12 bg-input/30 pl-10 text-base md:text-sm"
                  value={input.profileUrl}
                  onChange={(event) => setInput({ profileUrl: event.target.value })}
                  placeholder="https://substack.com/@yourname"
                  aria-describedby="profile-url-hint"
                  required
                />
              </div>
            </Field>

            <FieldSet className="min-w-0 gap-2">
              <FieldLegend variant="label" className="mb-0">Look back</FieldLegend>
              <div style={{ marginBottom: "0.01px" }}></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([7, 14, 30, "custom"] as const).map((selection) => (
                  <div key={selection} className="relative">
                    <input
                      className="peer sr-only"
                      type="radio"
                      name="range"
                      id={`range-${selection}`}
                      value={selection}
                      checked={rangeSelection === selection}
                      onChange={() => {
                        onRangeSelectionChange(selection)
                        if (selection !== "custom") setInput({ days: selection })
                      }}
                    />
                    <label
                      htmlFor={`range-${selection}`}
                      className="flex h-12 cursor-pointer items-center justify-center rounded-lg border border-input bg-input/30 px-2 text-center text-sm font-medium text-foreground transition-colors hover:bg-accent peer-checked:border-primary/70 peer-checked:bg-primary/15 peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
                    >
                      {selection === "custom" ? "Custom" : `${selection} days`}
                    </label>
                  </div>
                ))}
              </div>
              {rangeSelection === "custom" ? (
                <Field className="mt-1 max-w-44">
                  <FieldLabel htmlFor="custom-days">Number of days</FieldLabel>
                  <Input
                    id="custom-days"
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    className="h-11 bg-input/30"
                    value={input.days}
                    onChange={(event) => setInput({ days: Number(event.target.value) })}
                    required
                  />
                </Field>
              ) : null}
            </FieldSet>
          </FieldGroup>

          <details ref={settingsRef} className="group/settings mt-6 border-t border-border pt-4">
            <summary className="flex min-h-9 w-fit cursor-pointer list-none items-center gap-2 rounded-sm text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <Settings2Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              Request settings
              <span className="hidden text-xs font-normal text-muted-foreground sm:inline">· {settingsSummary}</span>
              <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open/settings:rotate-180" aria-hidden="true" />
            </summary>
            <FieldGroup className="mt-4 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="rpm">Requests per minute</FieldLabel>
                <Input
                  id="rpm"
                  type="number"
                  min={10}
                  max={60}
                  step={1}
                  inputMode="numeric"
                  className="h-11 bg-input/30"
                  value={input.requestsPerMinute}
                  onChange={(event) => setInput({ requestsPerMinute: Number(event.target.value) })}
                  aria-describedby="rpm-hint"
                />
                <FieldDescription id="rpm-hint" className="text-xs">10–60; lower this if Substack slows the scan.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="concurrency">Parallel requests</FieldLabel>
                <Input
                  id="concurrency"
                  type="number"
                  min={1}
                  max={8}
                  step={1}
                  inputMode="numeric"
                  className="h-11 bg-input/30"
                  value={input.concurrency}
                  onChange={(event) => setInput({ concurrency: Number(event.target.value) })}
                  aria-describedby="concurrency-hint"
                />
                <FieldDescription id="concurrency-hint" className="text-xs">1–8; fewer requests may reduce rate limits.</FieldDescription>
              </Field>
            </FieldGroup>
            <p className="mt-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Scans use Substack&apos;s public APIs. If rate limits occur, try fewer requests per minute or fewer parallel requests.
            </p>
          </details>
        </CardContent>

        <CardFooter className="mt-6 flex flex-col-reverse items-stretch gap-3 bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground sm:justify-start sm:text-left">
            <InfoIcon className="size-4 shrink-0" aria-hidden="true" />
            Scanning the last {input.days} {input.days === 1 ? "day" : "days"}
          </p>
          {isScanning ? (
            <Button type="button" variant="outline" size="lg" className="h-12 w-full sm:h-10 sm:w-auto" onClick={onCancel}>
              <XIcon data-icon="inline-start" />
              Cancel scan
            </Button>
          ) : (
            <Button type="submit" size="lg" className="h-12 w-full px-4 sm:h-10 sm:w-auto">
              <RadarIcon data-icon="inline-start" />
              Scan engagement
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  )
}
