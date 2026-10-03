/**
 * Zoom normalization utilities for scaling side panels and extension views.
 * When a root element is scaled using CSS transform: scale(zoomFactor),
 * getBoundingClientRect() and event coordinates reflect viewport pixels,
 * whereas position: fixed elements inside the transformed container operate
 * in local CSS pixels. These helpers bridge the coordinate spaces.
 */

/**
 * Returns the effective zoom factor applied to the extension UI via
 * the CSS variable `--extension-zoom-factor` (or defaults to 1).
 */
export function getEffectiveZoomFactor(): number {
  if (typeof document === 'undefined' || !document.documentElement) return 1;
  const raw = document.documentElement.style.getPropertyValue('--extension-zoom-factor');
  if (!raw) return 1;
  const parsed = parseFloat(raw);
  return parsed > 0 && Number.isFinite(parsed) ? parsed : 1;
}

export interface RectLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width?: number;
  height?: number;
}

/**
 * Normalizes viewport coordinates (e.g. from getBoundingClientRect) into
 * local container coordinates when the container is scaled by CSS transform.
 */
export function normalizeRectForZoom<T extends RectLike>(
  rect: T,
  zoom: number = getEffectiveZoomFactor()
): T {
  if (Math.abs(zoom - 1) < 0.001 || !zoom || zoom <= 0) return rect;
  return {
    ...rect,
    top: rect.top / zoom,
    bottom: rect.bottom / zoom,
    left: rect.left / zoom,
    right: rect.right / zoom,
    width: rect.width !== undefined ? rect.width / zoom : undefined,
    height: rect.height !== undefined ? rect.height / zoom : undefined,
  };
}

/**
 * Normalizes a point (e.g. mouse or context menu cursor coords) into
 * local container coordinates when the container is scaled by CSS transform.
 */
export function normalizePointForZoom(
  point: { x: number; y: number } | null | undefined,
  zoom: number = getEffectiveZoomFactor()
): { x: number; y: number } | null {
  if (!point) return null;
  if (Math.abs(zoom - 1) < 0.001 || !zoom || zoom <= 0) return point;
  return {
    x: point.x / zoom,
    y: point.y / zoom,
  };
}

/**
 * Returns the effective viewport width and height inside the transformed coordinate space.
 */
export function getScaledViewportDimensions(zoom: number = getEffectiveZoomFactor()): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  if (Math.abs(zoom - 1) < 0.001 || !zoom || zoom <= 0) {
    return { width: window.innerWidth, height: window.innerHeight };
  }
  return {
    width: window.innerWidth / zoom,
    height: window.innerHeight / zoom,
  };
}
