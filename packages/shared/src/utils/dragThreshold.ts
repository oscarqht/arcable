import React, { useRef, useCallback } from 'react';
import { endDrag, getActiveDrag, DEFAULT_DRAG_THRESHOLD } from './dragState';

export { DEFAULT_DRAG_THRESHOLD };

export interface DraggableMouseDownOptions {
  disabled?: boolean;
}

/**
 * Attaches to onMouseDown on a draggable element.
 * If the user clicked an interactive child element (e.g. close button, dropdown menu),
 * temporarily disables draggable for that click so buttons fire immediately without drag.
 */
export function handleDraggableMouseDown(
  e: React.MouseEvent<any>,
  options?: DraggableMouseDownOptions
): void {
  if (options?.disabled || e.button !== 0) return;
  const el = e.currentTarget as HTMLElement;
  const target = e.target as HTMLElement | null;

  // Record start time & pos for click recovery if needed
  el.dataset.dragMouseDownTime = String(Date.now());
  el.dataset.dragMouseDownX = String(e.clientX);
  el.dataset.dragMouseDownY = String(e.clientY);

  const interactive = target?.closest('button, input, textarea, select, a, [role="button"], [data-no-drag]');
  if (interactive && interactive !== el && el.contains(interactive)) {
    el.draggable = false;
    const restore = () => {
      el.draggable = true;
      window.removeEventListener('mouseup', restore);
    };
    window.addEventListener('mouseup', restore, { once: true });
  } else {
    el.draggable = true;
  }
}

/**
 * Checks if a drag event is acceptable.
 * Drop targets should use isDragAcceptable from dragState.ts.
 */
export function shouldAllowDrag(
  e: React.DragEvent<any>,
  _options?: { threshold?: number }
): boolean {
  // If activeDrag exists and has threshold info, verify it
  const activeDrag = getActiveDrag();
  if (activeDrag && activeDrag.hasMovedPastThreshold === false) {
    if (e.clientX && e.clientY && activeDrag.startX !== undefined && activeDrag.startY !== undefined) {
      const dist = Math.hypot(e.clientX - activeDrag.startX, e.clientY - activeDrag.startY);
      if (dist >= (activeDrag.threshold ?? DEFAULT_DRAG_THRESHOLD)) {
        activeDrag.hasMovedPastThreshold = true;
      }
    }
    return activeDrag.hasMovedPastThreshold;
  }
  return true;
}

/**
 * Handles onDragEnd for draggable elements.
 * If Chromium converted a click with micro-jitter into a dragstart, but no drop target was hit
 * and movement was within threshold, invokes the click fallback so clicks are never swallowed.
 */
export function handleDraggableDragEnd(
  e: React.DragEvent<any>,
  options?: { onClick?: (e: any) => void }
): void {
  const el = e.currentTarget as HTMLElement;
  const activeDrag = getActiveDrag();

  const wasDropped = activeDrag?.dropped ?? false;
  const hasMovedPastThreshold = activeDrag?.hasMovedPastThreshold ?? false;

  const startMs = el?.dataset?.dragMouseDownTime ? Number(el.dataset.dragMouseDownTime) : (activeDrag?.startTime ?? 0);
  const elapsed = startMs > 0 ? Date.now() - startMs : 1000;

  if (el?.dataset) {
    delete el.dataset.dragMouseDownTime;
    delete el.dataset.dragMouseDownX;
    delete el.dataset.dragMouseDownY;
  }

  const isMicroClick = !wasDropped && !hasMovedPastThreshold && elapsed < 400;

  endDrag();

  if (isMicroClick) {
    // Chromium suppressed the native click event due to micro-movement.
    // Recover user click intent:
    if (el) {
      el.dataset.lastAutoClickTime = String(Date.now());
    }
    options?.onClick?.(e);
  } else {
    if (el?.dataset) {
      el.dataset.wasDragging = 'true';
      setTimeout(() => {
        delete el.dataset.wasDragging;
      }, 100);
    }
  }
}

/**
 * Checks if a native click event should be permitted or if it was the conclusion of a real drag.
 */
export function shouldAllowClick(e: React.MouseEvent<any>): boolean {
  const el = e.currentTarget as HTMLElement;
  if (!el || !el.dataset) return true;

  if (el.dataset.wasDragging === 'true' || Boolean(getActiveDrag())) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }

  // Prevent double click if handleDraggableDragEnd already triggered click
  if (el.dataset.lastAutoClickTime) {
    const elapsed = Date.now() - Number(el.dataset.lastAutoClickTime);
    if (elapsed < 350) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }

  return true;
}

export interface UseDraggableWithThresholdOptions {
  enabled?: boolean;
  threshold?: number;
  onDragStart?: (e: React.DragEvent<any>) => void;
  onDragEnd?: (e: React.DragEvent<any>) => void;
  onClick?: (e: React.MouseEvent<any>) => void;
}

/**
 * React hook for draggable items.
 * Keeps draggable={true} so browser native dragging works smoothly when dragging to reorder/organize,
 * while preventing inner buttons from dragging and recovering clicks if trackpad micro-jitter
 * caused Chromium to suppress native click events.
 */
export function useDraggableWithThreshold({
  enabled = true,
  threshold = DEFAULT_DRAG_THRESHOLD,
  onDragStart,
  onDragEnd,
  onClick,
}: UseDraggableWithThresholdOptions = {}) {
  const dragStartTimeRef = useRef(0);
  const wasDraggingRef = useRef(false);
  const lastClickTimeRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<any>) => {
      if (!enabled || e.button !== 0) return;
      handleDraggableMouseDown(e, { disabled: !enabled });
      dragStartTimeRef.current = Date.now();
    },
    [enabled]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent<any>) => {
      if (!enabled) {
        e.preventDefault();
        return;
      }
      dragStartTimeRef.current = Date.now();
      onDragStart?.(e);
    },
    [enabled, onDragStart]
  );

  const handleDragEnd = useCallback(
    (e: React.DragEvent<any>) => {
      const activeDrag = getActiveDrag();
      const wasDropped = activeDrag?.dropped ?? false;
      const hasMovedPastThreshold = activeDrag?.hasMovedPastThreshold ?? false;
      const elapsed = Date.now() - dragStartTimeRef.current;

      const isMicroClick = !wasDropped && !hasMovedPastThreshold && elapsed < 400;

      endDrag();
      onDragEnd?.(e);

      if (isMicroClick) {
        lastClickTimeRef.current = Date.now();
        onClick?.(e as any);
      } else {
        wasDraggingRef.current = true;
        setTimeout(() => {
          wasDraggingRef.current = false;
        }, 100);
      }
    },
    [onDragEnd, onClick]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<any>) => {
      if (wasDraggingRef.current || !shouldAllowClick(e)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (Date.now() - lastClickTimeRef.current < 350) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      lastClickTimeRef.current = Date.now();
      onClick?.(e);
    },
    [onClick]
  );

  return {
    draggable: enabled,
    handleMouseDown,
    handleDragStart,
    handleDragEnd,
    handleClick,
  };
}
