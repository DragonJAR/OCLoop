/**
 * Compute the scrollTop needed to keep a child row visible inside a viewport.
 * Returns null when the child is already fully visible.
 */
export function scrollTopToRevealItem(args: {
  childY: number
  childHeight: number
  scrollTop: number
  viewportHeight: number
}): number | null {
  const { childY, childHeight, scrollTop, viewportHeight } = args
  if (viewportHeight <= 0) return null

  const relativeY = childY - scrollTop
  if (relativeY < 0) {
    return childY
  }
  if (relativeY + childHeight > viewportHeight) {
    return childY + childHeight - viewportHeight
  }
  return null
}