// Pixels per second, independent of display refresh rate. Outside the viewport
// and in its middle we stop; speed grows smoothly only inside the edge band.
export function edgeScrollVelocity(position, viewportSize) {
  if (!Number.isFinite(position) || !Number.isFinite(viewportSize) || viewportSize <= 0 || position < 0 || position > viewportSize) return 0;
  const edge = Math.min(110, viewportSize / 4);
  if (position < edge) return -900 * ((edge - position) / edge) ** 2;
  if (position > viewportSize - edge) return 900 * ((position - viewportSize + edge) / edge) ** 2;
  return 0;
}
