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
