import assert from "node:assert/strict";
import { require } from "./testLoader.mjs";
const {
  anchorPanel,
  positionPanel,
  nearestPanelAnchor,
} = require("../../../packages/shared/src/utils/floatingPanels.ts");
const {
  normalizePanelLayout,
} = require("../../../packages/shared/src/utils/sidePanels.ts");
const { nearestDockPosition } = require("../src/content/dockPosition.ts");
const panel = {
  id: "test",
  url: "https://example.com",
  x: 80,
  y: 60,
  width: 300,
  height: 200,
};
for (const x of [80, 620])
  for (const y of [60, 440]) {
    const saved = anchorPanel({ ...panel, x, y }, 1000, 700);
    const grown = positionPanel(saved, 1200, 900);
    assert.equal(grown.x, x + (x === 620 ? 200 : 0));
    assert.equal(grown.y, y + (y === 440 ? 200 : 0));
    const tiny = positionPanel(saved, 200, 150);
    assert.equal(tiny.width, 184);
    assert.equal(tiny.height, 134);
    assert.deepEqual(positionPanel(saved, 1000, 700), saved);
    assert.deepEqual(
      normalizePanelLayout(JSON.parse(JSON.stringify(saved))).anchorX,
      saved.anchorX,
    );
  }
assert.deepEqual(nearestPanelAnchor(350, 300, 1000), {
  edge: "start",
  distance: 350,
});
assert.deepEqual(nearestPanelAnchor(250, 200, 700), {
  edge: "start",
  distance: 250,
});
assert.equal(
  normalizePanelLayout({ ...panel, anchorX: { edge: "bad", distance: 1 } }),
  undefined,
);
assert.equal(
  normalizePanelLayout({ ...panel, dockAnchor: { edge: "end", distance: -1 } }),
  undefined,
);
assert.equal(
  nearestDockPosition(150, 100, 300, [{ start: 140, end: 240 }]),
  35,
);
console.log(
  "PASS all free-panel edge combinations, ties, shrink/grow size retention, anchor validation and collision placement",
);
