export type DragItemType = 'space' | 'folder' | 'tab' | 'pinnedTab' | 'favTab';

export interface DragItemData {
  id: string;
  type: DragItemType;
  parentFolderId?: string;
  parentSpaceId?: string;
  [key: string]: any;
}

let activeDragItem: DragItemData | null = null;

export function startDrag(e: React.DragEvent, item: DragItemData): void {
  activeDragItem = item;

  try {
    e.dataTransfer.setData('application/json', JSON.stringify(item));
    e.dataTransfer.setData(`application/x-arcable-${item.type.toLowerCase()}`, item.id);
    e.dataTransfer.effectAllowed = 'move';
  } catch {}
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
