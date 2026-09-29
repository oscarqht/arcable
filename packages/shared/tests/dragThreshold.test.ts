import assert from 'node:assert';
import {
  DEFAULT_DRAG_THRESHOLD,
  handleDraggableMouseDown,
  shouldAllowDrag,
  handleDraggableDragEnd,
  shouldAllowClick,
} from '../src/utils/dragThreshold';
import { startDrag, endDrag } from '../src/utils/dragState';

// Minimal polyfill for DOM element in Node test environment if needed
class MockElement {
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
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
  addEventListener: (event: string, handler: Function) => {
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
assert.strictEqual(DEFAULT_DRAG_THRESHOLD, 5, 'Default drag threshold should be 5 pixels');
console.log('✓ Test 1: DEFAULT_DRAG_THRESHOLD is 5px');

// Test 2: Micro-movements (< 5px) do not trigger drag threshold
{
  const container = new MockElement('div');
  let thresholdMetCalled = false;

  const mockMouseDownEvent: any = {
    button: 0,
    clientX: 100,
    clientY: 100,
    currentTarget: container,
    target: container,
  };

  handleDraggableMouseDown(mockMouseDownEvent, {
    threshold: 5,
    onThresholdMet: () => {
      thresholdMetCalled = true;
    },
  });

  assert.strictEqual(container.dataset.dragStartX, '100');
  assert.strictEqual(container.dataset.dragStartY, '100');
  assert.strictEqual(container.dataset.dragThresholdMet, 'false');
  assert.strictEqual(container.getAttribute('draggable'), null);

  // Micro-jitter: 3px move
  triggerWindowEvent('mousemove', { clientX: 102, clientY: 102 }); // dist ~ 2.82px
  assert.strictEqual(thresholdMetCalled, false, 'Threshold should not be met for micro jitter');
  assert.strictEqual(container.getAttribute('draggable'), null);

  // Attempting dragstart before threshold is rejected
  let defaultPrevented = false;
  const mockDragEvent: any = {
    clientX: 102,
    clientY: 102,
    currentTarget: container,
    preventDefault: () => {
      defaultPrevented = true;
    },
  };
  const allowed = shouldAllowDrag(mockDragEvent, { threshold: 5 });
  assert.strictEqual(allowed, false, 'Drag should not be allowed for micro movements');
  assert.strictEqual(defaultPrevented, true, 'Default must be prevented');

  // Mouse up concludes without drag
  triggerWindowEvent('mouseup', {});
  // shouldAllowClick should be true
  const mockClickEvent: any = {
    currentTarget: container,
    preventDefault: () => {},
    stopPropagation: () => {},
  };
  assert.strictEqual(shouldAllowClick(mockClickEvent), true, 'Click should be allowed when no drag occurred');
  console.log('✓ Test 2: Micro-movements (< 5px) prevent drag and allow click');
}

// Test 3: Intentional movement (>= 5px) activates draggable and allows drag
{
  const container = new MockElement('div');
  let thresholdMetCalled = false;

  const mockMouseDownEvent: any = {
    button: 0,
    clientX: 100,
    clientY: 100,
    currentTarget: container,
    target: container,
  };

  handleDraggableMouseDown(mockMouseDownEvent, {
    threshold: 5,
    onThresholdMet: () => {
      thresholdMetCalled = true;
    },
  });

  // Move 6px horizontally
  triggerWindowEvent('mousemove', { clientX: 106, clientY: 100 });
  assert.strictEqual(thresholdMetCalled, true, 'onThresholdMet should be invoked when threshold >= 5px is reached');
  assert.strictEqual(container.getAttribute('draggable'), 'true', 'draggable="true" should be set dynamically');
  assert.strictEqual(container.dataset.dragThresholdMet, 'true');

  const mockDragEvent: any = {
    clientX: 106,
    clientY: 100,
    currentTarget: container,
    preventDefault: () => {},
  };
  const allowed = shouldAllowDrag(mockDragEvent, { threshold: 5 });
  assert.strictEqual(allowed, true, 'Drag should be allowed when threshold is reached');

  // When drag ends, wasDragging is set to suppress trailing click
  const mockDragEndEvent: any = {
    currentTarget: container,
  };
  handleDraggableDragEnd(mockDragEndEvent);
  assert.strictEqual(container.getAttribute('draggable'), null, 'draggable attribute should be cleaned up');
  assert.strictEqual(container.dataset.wasDragging, 'true', 'wasDragging flag should be set on drag end');

  let clickPrevented = false;
  let clickStopped = false;
  const mockClickEvent: any = {
    currentTarget: container,
    preventDefault: () => {
      clickPrevented = true;
    },
    stopPropagation: () => {
      clickStopped = true;
    },
  };
  const clickAllowed = shouldAllowClick(mockClickEvent);
  assert.strictEqual(clickAllowed, false, 'Trailing click after a drag must be suppressed');
  assert.strictEqual(clickPrevented, true);
  assert.strictEqual(clickStopped, true);
  console.log('✓ Test 3: Intentional movement (>= 5px) activates drag and suppresses trailing click');
}

// Test 4: Inner interactive elements (e.g. close tab button) bypass drag initialization
{
  const container = new MockElement('div');
  const closeBtn = new MockElement('button');
  closeBtn.parentElement = container;

  let thresholdMetCalled = false;
  const mockMouseDownEvent: any = {
    button: 0,
    clientX: 100,
    clientY: 100,
    currentTarget: container,
    target: closeBtn, // user clicked the inner close button!
  };

  handleDraggableMouseDown(mockMouseDownEvent, {
    threshold: 5,
    onThresholdMet: () => {
      thresholdMetCalled = true;
    },
  });

  assert.strictEqual(container.dataset.dragStartX, undefined, 'Drag should not be initiated when clicking inner button');
  console.log('✓ Test 4: Inner button click bypasses drag initialization');
}

console.log('All dragThreshold tests PASSED successfully!');
