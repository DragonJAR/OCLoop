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

  // Guard against div-by-zero / negative viewport: the function returns
  // null (the caller treats null as "no scroll needed") rather than a
  // negative scrollTop, which would otherwise wrap-around in unsigned
  // contexts and break the list UI. Pin the contract.
  it("returns null for non-positive or non-finite viewportHeight", () => {
    expect(
      scrollTopToRevealIndex({ index: 3, scrollTop: 0, viewportHeight: 0 }),
    ).toBeNull()
    expect(
      scrollTopToRevealIndex({ index: 3, scrollTop: 0, viewportHeight: -5 }),
    ).toBeNull()
    expect(
      scrollTopToRevealIndex({ index: 3, scrollTop: 0, viewportHeight: NaN }),
    ).toBeNull()
  })

  it("returns null for negative or non-finite index", () => {
    expect(
      scrollTopToRevealIndex({ index: -1, scrollTop: 0, viewportHeight: viewport }),
    ).toBeNull()
    expect(
      scrollTopToRevealIndex({ index: -10, scrollTop: 5, viewportHeight: viewport }),
    ).toBeNull()
    expect(
      scrollTopToRevealIndex({ index: NaN, scrollTop: 0, viewportHeight: viewport }),
    ).toBeNull()
  })

  it("handles negative or non-finite scrollTop safely without negative target", () => {
    expect(
      scrollTopToRevealIndex({ index: 0, scrollTop: -5, viewportHeight: viewport }),
    ).toBeNull()
    expect(
      scrollTopToRevealIndex({ index: 8, scrollTop: NaN, viewportHeight: viewport }),
    ).toBe(3)
  })
})