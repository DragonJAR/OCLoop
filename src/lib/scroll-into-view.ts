/**
 * Compute scrollTop to keep a fixed-height row at `index` visible.
 * Rows are assumed height 1 (DialogSelect list items). Returns null when
 * the row is already fully visible.
 */
export function scrollTopToRevealIndex(args: {
  index: number
  scrollTop: number
  viewportHeight: number
}): number | null {
  const { index, scrollTop, viewportHeight } = args
  if (
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0 ||
    !Number.isFinite(index) ||
    index < 0
  ) {
    return null
  }

  const safeScrollTop = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0

  if (index < safeScrollTop) {
    return index
  }
  if (index >= safeScrollTop + viewportHeight) {
    return Math.max(0, index - viewportHeight + 1)
  }
  return null
}