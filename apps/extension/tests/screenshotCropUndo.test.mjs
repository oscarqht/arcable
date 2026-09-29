import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/editor/editor.js', import.meta.url), 'utf8');
const start = source.indexOf('  function applyCropBox(box) {');
const end = source.indexOf("  window.addEventListener('pointerdown', onPointerDown", start);
assert.ok(start !== -1 && end !== -1);
const applyCropBoxSource = source.slice(start, end);

test('drag crop can be undone and redone, including a second crop', () => {
  let shape = {
    id: 'screenshot',
    type: 'image',
    x: 0,
    y: 0,
    isLocked: true,
    props: { w: 200, h: 100, crop: null },
  };
  const undos = [];
  const redos = [];
  const editor = {
    run(action, options) {
      assert.equal(options.history, 'record');
      assert.equal(options.ignoreShapeLock, true);
      const before = structuredClone(shape);
      action();
      undos.push(before);
      redos.length = 0;
    },
    updateShape(update) {
      shape = { ...shape, ...update, props: { ...shape.props, ...update.props } };
    },
    setCroppingShape() {},
    selectNone() {},
    setCurrentTool() {},
  };
  const state = { isCroppingScreenshot: true, cropInitialState: {}, screenshotShapeId: shape.id };
  const applyCropBox = new Function(
    'editor', 'getScreenshotShape', 'editorState', 'setCropButtonActive',
    'document', 'updateScreenshotExportBounds', 'fitScreenshotToViewport',
    `${applyCropBoxSource}\nreturn applyCropBox;`
  )(
    editor, () => shape, state, () => {},
    { body: { classList: { remove() {} } } }, () => {}, () => {}
  );
  const crop = (x, y, w, h) => applyCropBox({
    boxPageX: x, boxPageY: y, boxPageW: w, boxPageH: h,
    metrics: { originX: 0, originY: 0, width: 200, height: 100 },
  });
  const undo = () => { redos.push(structuredClone(shape)); shape = undos.pop(); };
  const redo = () => { undos.push(structuredClone(shape)); shape = redos.pop(); };

  crop(20, 10, 150, 70);
  const firstCrop = structuredClone(shape);
  assert.deepEqual(shape.props.crop, {
    topLeft: { x: 0.1, y: 0.1 }, bottomRight: { x: 0.85, y: 0.8 },
  });
  crop(40, 20, 90, 40);
  const secondCrop = structuredClone(shape);
  undo();
  assert.deepEqual(shape, firstCrop);
  undo();
  assert.deepEqual(shape.props, { w: 200, h: 100, crop: null });
  redo();
  assert.deepEqual(shape, firstCrop);
  redo();
  assert.deepEqual(shape, secondCrop);
});

test('undo and redo of a crop action zooms image to fit again', () => {
  const undoRedoStart = source.indexOf('function getScreenshotShapeSnapshot(');
  const undoRedoEnd = source.indexOf('function setScreenshotLocked(', undoRedoStart);
  assert.ok(undoRedoStart !== -1 && undoRedoEnd !== -1);
  const undoRedoSource = source.slice(undoRedoStart, undoRedoEnd);

  let shape = {
    id: 'screenshot',
    type: 'image',
    x: 0,
    y: 0,
    isLocked: true,
    props: { w: 200, h: 100, crop: null },
  };
  const undos = [];
  const redos = [];
  let fitCount = 0;
  let updateBoundsCount = 0;

  const editorState = {
    screenshotShapeId: shape.id,
    lastSyncedScreenshotShapeState: null,
  };

  const editor = {
    undo() {
      if (undos.length === 0) return;
      redos.push(structuredClone(shape));
      shape = undos.pop();
    },
    redo() {
      if (redos.length === 0) return;
      undos.push(structuredClone(shape));
      shape = redos.pop();
    },
    history: {
      undo() {
        editor.undo();
      },
      redo() {
        editor.redo();
      },
    },
  };

  const getScreenshotShape = () => shape;
  const updateScreenshotExportBounds = () => {
    updateBoundsCount++;
  };
  const fitScreenshotToViewport = () => {
    fitCount++;
  };

  const { bindScreenshotCropUndoRedo } = new Function(
    'getScreenshotShape', 'editorState', 'updateScreenshotExportBounds', 'fitScreenshotToViewport',
    `${undoRedoSource}\nreturn { getScreenshotShapeSnapshot, hasScreenshotShapeSnapshotChanged, bindScreenshotCropUndoRedo };`
  )(
    getScreenshotShape, editorState, updateScreenshotExportBounds, fitScreenshotToViewport
  );

  const unbind = bindScreenshotCropUndoRedo(editor);

  // Initial state: crop is null
  const originalState = structuredClone(shape);

  // Perform crop 1
  undos.push(structuredClone(shape));
  shape = {
    ...shape,
    x: 20,
    y: 10,
    props: {
      ...shape.props,
      w: 150,
      h: 70,
      crop: { topLeft: { x: 0.1, y: 0.1 }, bottomRight: { x: 0.85, y: 0.8 } },
    },
  };
  const crop1State = structuredClone(shape);

  assert.equal(fitCount, 0);

  // Undo crop 1 -> should zoom to fit original state
  editor.undo();
  assert.deepEqual(shape, originalState);
  assert.equal(fitCount, 1);
  assert.equal(updateBoundsCount, 1);

  // Redo crop 1 -> should zoom to fit crop 1
  editor.redo();
  assert.deepEqual(shape, crop1State);
  assert.equal(fitCount, 2);
  assert.equal(updateBoundsCount, 2);

  // Non-crop undo (e.g. annotation undone, screenshot shape unchanged)
  editor.undo(); // back to original state
  assert.equal(fitCount, 3);
  fitCount = 0;
  updateBoundsCount = 0;

  // Simulate an undo where screenshot shape does not change (e.g. an arrow shape was undone)
  undos.push(structuredClone(shape));
  editor.undo();
  assert.equal(fitCount, 0, 'fitScreenshotToViewport should not be called when screenshot shape does not change');
  assert.equal(updateBoundsCount, 0);

  unbind();
});

test('syncScreenshotCropState zooms image to fit if screenshot shape crop changed outside crop mode', () => {
  const helpersStart = source.indexOf('function getScreenshotShapeSnapshot(');
  const helpersEnd = source.indexOf('function bindCropDragInteraction(', helpersStart);
  assert.ok(helpersStart !== -1 && helpersEnd !== -1);
  const helpersSource = source.slice(helpersStart, helpersEnd);

  let shape = {
    id: 'screenshot',
    type: 'image',
    x: 0,
    y: 0,
    isLocked: true,
    props: { w: 200, h: 100, crop: null },
  };
  let fitCount = 0;
  let updateBoundsCount = 0;
  let cropBtnActive = false;

  const editorState = {
    editor: { isIn: () => false },
    screenshotShapeId: shape.id,
    isCroppingScreenshot: false,
    cropInitialState: null,
    lastSyncedScreenshotShapeState: null,
  };

  const getScreenshotShape = () => shape;
  const updateScreenshotExportBounds = () => {
    updateBoundsCount++;
  };
  const fitScreenshotToViewport = () => {
    fitCount++;
  };
  const setCropButtonActive = (active) => {
    cropBtnActive = active;
  };
  const finishScreenshotCrop = () => {};
  const mockDocument = {
    body: {
      classList: {
        toggle() {},
        remove() {},
      },
    },
    addEventListener() {},
    removeEventListener() {},
  };

  const { getScreenshotShapeSnapshot, syncScreenshotCropState } = new Function(
    'getScreenshotShape', 'editorState', 'updateScreenshotExportBounds',
    'fitScreenshotToViewport', 'setCropButtonActive', 'finishScreenshotCrop',
    'document', 'window',
    `${helpersSource}\nreturn { getScreenshotShapeSnapshot, syncScreenshotCropState };`
  )(
    getScreenshotShape, editorState, updateScreenshotExportBounds,
    fitScreenshotToViewport, setCropButtonActive, finishScreenshotCrop,
    mockDocument, { requestAnimationFrame() {}, cancelAnimationFrame() {} }
  );

  // Initial sync records state
  syncScreenshotCropState();
  assert.equal(fitCount, 0);
  assert.ok(editorState.lastSyncedScreenshotShapeState);

  // Simulate an undo that reverted shape crop props while not in crop mode
  shape = {
    ...shape,
    props: {
      ...shape.props,
      crop: { topLeft: { x: 0.1, y: 0.1 }, bottomRight: { x: 0.9, y: 0.9 } },
    },
  };

  syncScreenshotCropState();
  assert.equal(fitCount, 1, 'should fit to viewport when shape crop changed');

  // Calling sync again without changes shouldn't trigger fit again
  syncScreenshotCropState();
  assert.equal(fitCount, 1, 'should not re-trigger fit when unchanged');
});

