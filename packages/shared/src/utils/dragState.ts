export type DragItemType = 'space' | 'folder' | 'tab' | 'pinnedTab' | 'favTab' | 'widget' | 'favItem' | 'tmpTab';

export interface DragItemData {
  id: string;
  type: DragItemType;
  parentFolderId?: string;
  parentSpaceId?: string;
  startX?: number;
  startY?: number;
  startTime?: number;
  threshold?: number;
  hasMovedPastThreshold?: boolean;
  dropped?: boolean;
  [key: string]: any;
}

let activeDragItem: DragItemData | null = null;

export const DEFAULT_DRAG_THRESHOLD = 6; // pixels

export function startDrag(e: React.DragEvent, item: DragItemData): void {
  const hasCoords = typeof e?.clientX === 'number' && typeof e?.clientY === 'number' && (e.clientX !== 0 || e.clientY !== 0);

  activeDragItem = {
    ...item,
    startX: hasCoords ? e.clientX : undefined,
    startY: hasCoords ? e.clientY : undefined,
    startTime: Date.now(),
    threshold: item.threshold ?? DEFAULT_DRAG_THRESHOLD,
    hasMovedPastThreshold: !hasCoords, // If no coordinates provided (e.g. tests), default to true
    dropped: false,
  };

  try {
    e.dataTransfer.setData('application/json', JSON.stringify(item));
    e.dataTransfer.setData(`application/x-arcable-${item.type.toLowerCase()}`, item.id);
    e.dataTransfer.effectAllowed = 'move';
  } catch {}
}

export function recordDragDrop(): void {
  if (activeDragItem) {
    activeDragItem.dropped = true;
  }
}

export function endDrag(): void {
  activeDragItem = null;
}

export function getActiveDrag(): DragItemData | null {
  return activeDragItem;
}

export function isDragAcceptable(
  e: React.DragEvent,
  allowedTypes: DragItemType[]
): boolean {
  if (activeDragItem) {
    if (!activeDragItem.hasMovedPastThreshold && activeDragItem.startX !== undefined && activeDragItem.startY !== undefined) {
      const cx = e?.clientX;
      const cy = e?.clientY;
      if (typeof cx === 'number' && typeof cy === 'number' && (cx !== 0 || cy !== 0)) {
        const dist = Math.hypot(cx - activeDragItem.startX, cy - activeDragItem.startY);
        if (dist >= (activeDragItem.threshold ?? DEFAULT_DRAG_THRESHOLD)) {
          activeDragItem.hasMovedPastThreshold = true;
        }
      }
    }

    if (!activeDragItem.hasMovedPastThreshold) {
      return false;
    }

    return allowedTypes.includes(activeDragItem.type);
  }

  if (e.dataTransfer && e.dataTransfer.types) {
    try {
      const types = Array.from(e.dataTransfer.types).map((t) => t.toLowerCase());
      for (const allowed of allowedTypes) {
        if (types.includes(`application/x-arcable-${allowed.toLowerCase()}`)) {
          return true;
        }
      }
    } catch {}
  }

  return false;
}

// Global safety cleanup listeners for window
if (typeof window !== 'undefined') {
  window.addEventListener('dragend', () => {
    activeDragItem = null;
  });
  window.addEventListener('drop', () => {
    activeDragItem = null;
  });
}
