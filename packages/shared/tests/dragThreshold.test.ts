import assert from 'node:assert';
import {
  DEFAULT_DRAG_THRESHOLD,
  handleDraggableMouseDown,
  shouldAllowDrag,
  handleDraggableDragEnd,
  shouldAllowClick,
} from '../src/utils/dragThreshold';
import { startDrag, endDrag, getActiveDrag, recordDragDrop, isDragAcceptable } from '../src/utils/dragState';

// Minimal polyfill for DOM element in Node test environment
class MockElement {
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  draggable: boolean = true;
  parentElement: MockElement | null = null;
  tagName: string;

  constructor(tagName: string = 'div') {
    this.tagName = tagName.toUpperCase();
  }

  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  removeAttribute(name: string) {
    delete this.attributes[name];
  }

  closest(selector: string): MockElement | null {
    if (selector.toLowerCase().includes(this.tagName.toLowerCase())) {
      return this;
    }
    return this.parentElement ? this.parentElement.closest(selector) : null;
  }

  contains(child: MockElement): boolean {
    let curr: MockElement | null = child;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentElement;
    }
    return false;
  }
}

// Global window mock for event listeners
const windowListeners: Record<string, Array<Function>> = {};
(global as any).window = {
  addEventListener: (event: string, handler: Function, opts?: any) => {
    windowListeners[event] = windowListeners[event] || [];
    windowListeners[event].push(handler);
  },
  removeEventListener: (event: string, handler: Function) => {
    if (!windowListeners[event]) return;
    windowListeners[event] = windowListeners[event].filter((h) => h !== handler);
  },
};

function triggerWindowEvent(name: string, eventObj: any) {
  const listeners = [...(windowListeners[name] || [])];
  for (const fn of listeners) {
    fn(eventObj);
  }
}

console.log('Running dragThreshold unit tests...');

// Test 1: DEFAULT_DRAG_THRESHOLD
assert.strictEqual(DEFAULT_DRAG_THRESHOLD, 6, 'Default drag threshold should be 6 pixels');
console.log('✓ Test 1: DEFAULT_DRAG_THRESHOLD is 6px');

// Test 2: Elements remain draggable={true} by default so native dragstart works
{
  const container = new MockElement('div');
  container.draggable = true;

  const mockMouseDownEvent: any = {
    button: 0,
    clientX: 100,
    clientY: 100,
    currentTarget: container,
    target: container,
  };

  handleDraggableMouseDown(mockMouseDownEvent);
  assert.strictEqual(container.draggable, true, 'Element must remain draggable={true} on mousedown');
  console.log('✓ Test 2: Draggable state is preserved at mousedown');
}

// Test 3: Micro-jitter (< 6px) is rejected by drop targets (isDragAcceptable = false)
{
  endDrag();
  const mockDragEvent: any = {
    clientX: 100,
    clientY: 100,
    dataTransfer: {
      setData: () => {},
      effectAllowed: 'move',
    },
  };

  startDrag(mockDragEvent, { id: 'tab-1', type: 'tab' });
  const active = getActiveDrag();
  assert.ok(active, 'Drag should be active');
  assert.strictEqual(active?.hasMovedPastThreshold, false, 'hasMovedPastThreshold should be false initially');

  // Move 2px (micro-jitter)
  const mockMoveEvent: any = {
    clientX: 102,
    clientY: 101,
  };
  const acceptable = isDragAcceptable(mockMoveEvent, ['tab']);
  assert.strictEqual(acceptable, false, 'Micro movement (< 6px) must NOT be acceptable as a drag target');
  console.log('✓ Test 3: Micro-jitter (< 6px) rejected by drop targets');
}

// Test 4: Intentional movement (>= 6px) activates threshold and allows drops
{
  const mockMoveEvent: any = {
    clientX: 107,
    clientY: 107,
  };
  const acceptable = isDragAcceptable(mockMoveEvent, ['tab']);
  assert.strictEqual(acceptable, true, 'Movement >= 6px must be acceptable as a drag target');
  const active = getActiveDrag();
  assert.strictEqual(active?.hasMovedPastThreshold, true, 'hasMovedPastThreshold should now be true');
  console.log('✓ Test 4: Movement >= 6px meets threshold and enables drop targets');
}

// Test 5: Micro-click recovery: if drag ended without threshold met and without dropping, onClick fallback fires
{
  endDrag();
  const container = new MockElement('div');
  const mockStartEvent: any = {
    clientX: 100,
    clientY: 100,
    dataTransfer: {
      setData: () => {},
      effectAllowed: 'move',
    },
  };
  startDrag(mockStartEvent, { id: 'tab-click', type: 'tab' });

  let clickFired = false;
  const mockDragEndEvent: any = {
    currentTarget: container,
  };

  handleDraggableDragEnd(mockDragEndEvent, {
    onClick: () => {
      clickFired = true;
    },
  });

  assert.strictEqual(clickFired, true, 'Micro-drag click fallback should execute tab onClick');
  console.log('✓ Test 5: Micro-jitter drag triggers click recovery');
}

// Test 6: Intentional drag suppresses trailing clicks
{
  endDrag();
  const container = new MockElement('div');
  const mockStartEvent: any = {
    clientX: 100,
    clientY: 100,
    dataTransfer: {
      setData: () => {},
      effectAllowed: 'move',
    },
  };
  startDrag(mockStartEvent, { id: 'tab-drag', type: 'tab' });

  // Move 10px
  isDragAcceptable({ clientX: 110, clientY: 110 } as any, ['tab']);
  recordDragDrop();

  let clickFired = false;
  const mockDragEndEvent: any = {
    currentTarget: container,
  };

  handleDraggableDragEnd(mockDragEndEvent, {
    onClick: () => {
      clickFired = true;
    },
  });

  assert.strictEqual(clickFired, false, 'Click must NOT fire when a real drag occurred');
  assert.strictEqual(container.dataset.wasDragging, 'true', 'wasDragging flag must be set');

  let clickPrevented = false;
  const mockClickEvent: any = {
    currentTarget: container,
    preventDefault: () => {
      clickPrevented = true;
    },
    stopPropagation: () => {},
  };

  const allowed = shouldAllowClick(mockClickEvent);
  assert.strictEqual(allowed, false, 'Trailing click should be blocked');
  assert.strictEqual(clickPrevented, true);
  console.log('✓ Test 6: Intentional drag suppresses trailing click');
}

// Test 7: Inner interactive elements (e.g. close tab button) temporarily disable draggable
{
  const container = new MockElement('div');
  container.draggable = true;
  const closeBtn = new MockElement('button');
  closeBtn.parentElement = container;

  const mockMouseDownEvent: any = {
    button: 0,
    clientX: 100,
    clientY: 100,
    currentTarget: container,
    target: closeBtn, // user clicked the inner close button
  };

  handleDraggableMouseDown(mockMouseDownEvent);
  assert.strictEqual(container.draggable, false, 'Draggable should be disabled when clicking inner button');

  // After mouse up, draggable is restored
  triggerWindowEvent('mouseup', {});
  assert.strictEqual(container.draggable, true, 'Draggable should be restored on mouseup');
  console.log('✓ Test 7: Inner button clicks bypass drag and restore draggable');
}

console.log('All dragThreshold tests PASSED successfully!');
