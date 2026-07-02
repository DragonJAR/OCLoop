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
  if (viewportHeight <= 0) return null

  if (index < scrollTop) {
    return index
  }
  if (index >= scrollTop + viewportHeight) {
    return index - viewportHeight + 1
  }
  return null
}