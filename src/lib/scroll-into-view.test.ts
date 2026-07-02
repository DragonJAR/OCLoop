import { describe, expect, it } from "bun:test"
import { scrollTopToRevealItem } from "./scroll-into-view"

describe("scrollTopToRevealItem", () => {
  const viewport = 6
  const row = 1

  it("returns null when the row is fully visible", () => {
    expect(
      scrollTopToRevealItem({
        childY: 5,
        childHeight: row,
        scrollTop: 3,
        viewportHeight: viewport,
      }),
    ).toBeNull()
  })

  it("scrolls up when the row is above the viewport", () => {
    expect(
      scrollTopToRevealItem({
        childY: 2,
        childHeight: row,
        scrollTop: 5,
        viewportHeight: viewport,
      }),
    ).toBe(2)
  })

  it("scrolls down when the row is below the viewport (bottom-edge case)", () => {
    // scrollTop=5, viewport=6 → row at y=10 is visible (relative 5); y=11 needs scroll.
    expect(
      scrollTopToRevealItem({
        childY: 10,
        childHeight: row,
        scrollTop: 5,
        viewportHeight: viewport,
      }),
    ).toBeNull()
    expect(
      scrollTopToRevealItem({
        childY: 11,
        childHeight: row,
        scrollTop: 5,
        viewportHeight: viewport,
      }),
    ).toBe(6)
  })

  it("keeps the last visible row in view at the bottom edge", () => {
    expect(
      scrollTopToRevealItem({
        childY: 9,
        childHeight: row,
        scrollTop: 4,
        viewportHeight: viewport,
      }),
    ).toBeNull()
    expect(
      scrollTopToRevealItem({
        childY: 10,
        childHeight: row,
        scrollTop: 4,
        viewportHeight: viewport,
      }),
    ).toBe(5)
  })
})