import { describe, expect, it } from "bun:test"
import { scrollTopToRevealIndex } from "./scroll-into-view"

describe("scrollTopToRevealIndex", () => {
  const viewport = 6

  it("returns null when the row is fully visible", () => {
    expect(
      scrollTopToRevealIndex({
        index: 5,
        scrollTop: 3,
        viewportHeight: viewport,
      }),
    ).toBeNull()
  })

  it("scrolls up when the row is above the viewport", () => {
    expect(
      scrollTopToRevealIndex({
        index: 2,
        scrollTop: 5,
        viewportHeight: viewport,
      }),
    ).toBe(2)
  })

  it("scrolls down when the row is below the viewport (bottom-edge case)", () => {
    expect(
      scrollTopToRevealIndex({
        index: 10,
        scrollTop: 5,
        viewportHeight: viewport,
      }),
    ).toBeNull()
    expect(
      scrollTopToRevealIndex({
        index: 11,
        scrollTop: 5,
        viewportHeight: viewport,
      }),
    ).toBe(6)
  })

  it("keeps the last visible row in view at the bottom edge", () => {
    expect(
      scrollTopToRevealIndex({
        index: 9,
        scrollTop: 4,
        viewportHeight: viewport,
      }),
    ).toBeNull()
    expect(
      scrollTopToRevealIndex({
        index: 10,
        scrollTop: 4,
        viewportHeight: viewport,
      }),
    ).toBe(5)
  })
})