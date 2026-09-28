import { describe, expect, it } from "vitest"

import { initials } from "./initials"

describe("initials", () => {
  it("skips symbols and returns complete Unicode characters", () => {
    expect(initials("AIchemyst 🝳 Paul.Swift")).toBe("AP")
    expect(initials("Neela 🌶️")).toBe("N")
    expect(initials("𐐀lma Baker")).toBe("𐐀B")
  })
})
