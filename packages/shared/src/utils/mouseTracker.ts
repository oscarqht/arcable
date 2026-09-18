/**
 * Utility to track the last known pointer/mouse position and refresh hover states
 * when DOM elements shift, re-render, or are removed underneath a stationary cursor.
 */

let lastMousePos = { x: -1, y: -1 };

export const REFRESH_HOVER_EVENT = 'arcable:refresh-hover';

if (typeof window !== 'undefined') {
  const updatePos = (e: MouseEvent | PointerEvent) => {
    lastMousePos.x = e.clientX;
    lastMousePos.y = e.clientY;
  };

  window.addEventListener('mousemove', updatePos, { passive: true });
  window.addEventListener('pointermove', updatePos, { passive: true });
  window.addEventListener('mousedown', updatePos, { passive: true });
  window.addEventListener('mouseup', updatePos, { passive: true });
  window.addEventListener('click', updatePos, { passive: true });

  window.addEventListener('mouseleave', () => {
    lastMousePos.x = -1;
    lastMousePos.y = -1;
  });

  window.addEventListener('blur', () => {
    lastMousePos.x = -1;
    lastMousePos.y = -1;
  });
}

export function getLastMousePos(): { x: number; y: number } {
  return { ...lastMousePos };
}

export function updateLastMousePos(x: number, y: number): void {
  lastMousePos.x = x;
  lastMousePos.y = y;
}

/**
 * Checks if the given element is currently directly underneath the stationary cursor.
 * Uses document.elementFromPoint to respect z-index, visibility, and overlays.
 */
export function isElementUnderCursor(el: HTMLElement | null): boolean {
  if (!el || typeof document === 'undefined') return false;
  const { x, y } = lastMousePos;
  if (x < 0 || y < 0) return false;

  const target = document.elementFromPoint(x, y);
  if (!target) return false;

  return target === el || el.contains(target);
}

/**
 * Synthesizes mouse/pointer events to force browser engines (like Blink/Chrome)
 * and React to re-evaluate hover states for whatever element is now under the cursor.
 */
export function refreshHoverUnderCursor(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const { x, y } = lastMousePos;
  if (x < 0 || y < 0) return;

  const target = document.elementFromPoint(x, y);
  if (target) {
    target.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
        view: window,
      })
    );
    target.dispatchEvent(
      new MouseEvent('mouseover', {
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
        view: window,
      })
    );
    if (typeof PointerEvent !== 'undefined') {
      target.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
          view: window,
        })
      );
      target.dispatchEvent(
        new PointerEvent('pointerover', {
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
          view: window,
        })
      );
    }
  }

  // Also dispatch a custom event on window for active components listening for hover refresh
  window.dispatchEvent(new CustomEvent(REFRESH_HOVER_EVENT, { detail: { x, y } }));
}
