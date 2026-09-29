import React, { useState, useRef, useCallback } from 'react';
import { endDrag, getActiveDrag } from './dragState';

export const DEFAULT_DRAG_THRESHOLD = 5; // pixels

export interface DraggableMouseDownOptions {
  threshold?: number;
  disabled?: boolean;
  onThresholdMet?: (el: HTMLElement) => void;
}

/**
 * Attaches a distance threshold to an element before allowing HTML5 dragstart to initiate.
 * Prevents accidental drag initialization during normal mouse clicks with micro-jitter.
 */
export function handleDraggableMouseDown(
  e: React.MouseEvent<any>,
  options?: DraggableMouseDownOptions
): void {
  if (options?.disabled || e.button !== 0) return;
  const el = e.currentTarget as HTMLElement;
  const target = e.target as HTMLElement | null;

  // Do not initiate drag if user clicked an interactive child element (buttons, inputs, links, etc.)
  const interactive = target?.closest('button, input, textarea, select, a, [role="button"], [data-no-drag]');
  if (interactive && interactive !== el && el.contains(interactive)) {
    return;
  }

  const startX = e.clientX;
  const startY = e.clientY;
  const threshold = options?.threshold ?? DEFAULT_DRAG_THRESHOLD;

  el.dataset.dragStartX = String(startX);
  el.dataset.dragStartY = String(startY);
  el.dataset.dragThresholdMet = 'false';
  el.removeAttribute('draggable');

  const cleanup = () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('blur', cleanup);
  };

  const onMouseMove = (moveEvent: MouseEvent) => {
    const dist = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
    if (dist >= threshold) {
      el.dataset.dragThresholdMet = 'true';
      el.setAttribute('draggable', 'true');
      options?.onThresholdMet?.(el);
      cleanup();
    }
  };

  const onMouseUp = () => {
    cleanup();
    setTimeout(() => {
      delete el.dataset.dragStartX;
      delete el.dataset.dragStartY;
      delete el.dataset.dragThresholdMet;
      if (!getActiveDrag()) {
        el.removeAttribute('draggable');
      }
    }, 60);
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', cleanup);
}

/**
 * Checks if the drag should be allowed based on distance traveled since mousedown.
 */
export function shouldAllowDrag(
  e: React.DragEvent<any>,
  options?: { threshold?: number }
): boolean {
  const el = e.currentTarget as HTMLElement;
  if (!el || !el.dataset) return true;
  if (el.dataset.dragThresholdMet === 'true') {
    return true;
  }
  const startX = el.dataset.dragStartX ? Number(el.dataset.dragStartX) : null;
  const startY = el.dataset.dragStartY ? Number(el.dataset.dragStartY) : null;
  if (startX !== null && startY !== null) {
    const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
    const threshold = options?.threshold ?? DEFAULT_DRAG_THRESHOLD;
    if (dist < threshold) {
      e.preventDefault();
      return false;
    }
  }
  return true;
}

/**
 * Cleans up drag threshold attributes and suppresses trailing clicks immediately after drag ends.
 */
export function handleDraggableDragEnd(e: React.DragEvent<any>): void {
  const el = e.currentTarget as HTMLElement;
  if (!el || !el.dataset) {
    endDrag();
    return;
  }
  delete el.dataset.dragStartX;
  delete el.dataset.dragStartY;
  delete el.dataset.dragThresholdMet;
  el.removeAttribute('draggable');
  el.dataset.wasDragging = 'true';
  endDrag();
  setTimeout(() => {
    delete el.dataset.wasDragging;
  }, 80);
}

/**
 * Checks if a click event should be permitted or if it was the conclusion of a drag gesture.
 */
export function shouldAllowClick(e: React.MouseEvent<any>): boolean {
  const el = e.currentTarget as HTMLElement;
  if (!el || !el.dataset) return true;
  if (el.dataset.wasDragging === 'true' || Boolean(getActiveDrag())) {
    e.preventDefault();
    e.stopPropagation();
    return false;
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
 * React hook for draggable items with built-in sensitivity / threshold handling.
 */
export function useDraggableWithThreshold({
  enabled = true,
  threshold = DEFAULT_DRAG_THRESHOLD,
  onDragStart,
  onDragEnd,
  onClick,
}: UseDraggableWithThresholdOptions = {}) {
  const [canDrag, setCanDrag] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);
  const wasDraggingRef = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<any>) => {
      if (!enabled) return;
      elementRef.current = e.currentTarget as HTMLElement;
      handleDraggableMouseDown(e, {
        threshold,
        disabled: !enabled,
        onThresholdMet: () => {
          setCanDrag(true);
        },
      });
    },
    [enabled, threshold]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent<any>) => {
      if (!enabled || !shouldAllowDrag(e, { threshold })) {
        e.preventDefault();
        return;
      }
      wasDraggingRef.current = true;
      onDragStart?.(e);
    },
    [enabled, threshold, onDragStart]
  );

  const handleDragEnd = useCallback(
    (e: React.DragEvent<any>) => {
      setCanDrag(false);
      handleDraggableDragEnd(e);
      onDragEnd?.(e);
      setTimeout(() => {
        wasDraggingRef.current = false;
      }, 80);
    },
    [onDragEnd]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<any>) => {
      if (wasDraggingRef.current || !shouldAllowClick(e)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onClick?.(e);
    },
    [onClick]
  );

  return {
    canDrag,
    handleMouseDown,
    handleDragStart,
    handleDragEnd,
    handleClick,
    elementRef,
  };
}
