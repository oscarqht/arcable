import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLastMousePos,
  updateLastMousePos,
  clearMousePos,
  isElementUnderCursor,
  refreshHoverUnderCursor,
  CLEAR_HOVER_EVENT,
  REFRESH_HOVER_EVENT,
} from '../src/utils/mouseTracker';

test('mouseTracker: tracking and clearing mouse position', () => {
  // Update mouse position
  updateLastMousePos(120, 250);
  assert.deepEqual(getLastMousePos(), { x: 120, y: 250 });

  let clearEventFired = false;
  const listener = () => {
    clearEventFired = true;
  };

  // Mock window custom event listener if in node environment
  if (typeof window !== 'undefined') {
    window.addEventListener(CLEAR_HOVER_EVENT, listener);
  }

  // Clear mouse position
  clearMousePos();
  assert.deepEqual(getLastMousePos(), { x: -1, y: -1 });

  // When cleared, isElementUnderCursor must be false
  assert.equal(isElementUnderCursor(null), false);
  const fakeElement = {} as HTMLElement;
  assert.equal(isElementUnderCursor(fakeElement), false);
});

test('mouseTracker: refreshHoverUnderCursor safely handles cleared coordinates', () => {
  clearMousePos();
  assert.deepEqual(getLastMousePos(), { x: -1, y: -1 });

  // Should not throw and should not dispatch when coordinates are negative
  refreshHoverUnderCursor();
  assert.deepEqual(getLastMousePos(), { x: -1, y: -1 });
});

test('hover behavior: opening a tmp tab clears hover coordinates preventing unintended hover jump', () => {
  // Simulate user hovering over a tab item in the side panel
  updateLastMousePos(150, 300);
  assert.deepEqual(getLastMousePos(), { x: 150, y: 300 });

  // When user opens a tmp tab, clearMousePos is called
  clearMousePos();
  const posAfterOpen = getLastMousePos();

  assert.equal(posAfterOpen.x, -1);
  assert.equal(posAfterOpen.y, -1);

  // Any subsequent check for element under cursor returns false
  const dummyFolderHeader = {} as HTMLElement;
  assert.equal(isElementUnderCursor(dummyFolderHeader), false);
});

test('folder popup safety: hover popup should not open if element is no longer under cursor', () => {
  // Simulate folder header checking before opening popup after timeout
  clearMousePos();
  const headerElement = {} as HTMLElement;

  const shouldOpenPopup = (el: HTMLElement | null): boolean => {
    return isElementUnderCursor(el);
  };

  // Since cursor moved out / cleared, shouldOpenPopup must be false
  assert.equal(shouldOpenPopup(headerElement), false);

  // If user is actively hovering inside window
  updateLastMousePos(200, 200);
  // Without document.elementFromPoint matching, it still stays false
  assert.equal(shouldOpenPopup(headerElement), false);
});
