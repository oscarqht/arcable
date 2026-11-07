# Floating panels

In the tab editor, use **Floating panels** to add a URL and optional title. For a tab with URL variants, select which variant owns the panels. Save the tab, then open it from the Chrome or Firefox extension.

- Drag the panel header to move it. Drag its lower-right handle to resize it.
- Select a docking edge in the header, or drag the panel within 24 pixels of an edge. The minus button docks to the right.
- Hover a dock chip to reveal its panel. Leaving both chip and panel hides it after 200 ms. The iframe stays mounted, retaining its document state while hidden.
- Click a chip (or activate it with Enter/Space) to keep the panel open; activate it again to hide it. Escape hides a docked panel. Keyboard focus keeps a revealed panel available until focus leaves.
- Focus the header and use arrow keys to move; Shift + arrow keys resize. The resize handle also accepts arrow keys.
- Choose **Float** to undock. Remove panels in the tab editor.
- Use **Open in tab** when a website blocks embedding. The extension does not modify frame security headers or the page's content security policy.

Panels belong to the saved item or selected variant, bound to the specific browser tab opened through Arcable. Navigation and reload retain that selection; selecting another variant switches it. Unrelated tabs with matching URLs do not receive panels. Browser internal pages and other protected pages cannot receive extension content scripts.

Saving panel additions or removals updates the associated browser tab immediately from the local operation queue, without waiting for Raindrop sync. Layout changes use the same workspace operation queue and Raindrop sync. Each bookmark's note contains a dedicated `arcable-floating-panels` JSON comment; variant bookmark notes are retained during hydration. User note text and other metadata remain alongside it. Local persistence and workspace backups include these notes. Dock-chip reveal/pin state is temporary; geometry and docking edge are saved. Panels are clamped to the current viewport without overwriting the saved larger layout.

## Verification

```sh
pnpm typecheck
pnpm build:extension
node apps/extension/tests/floatingPanels.test.mjs
node packages/shared/tests/rapidWorkspaceMutations.test.mjs
pnpm dlx tsx --test packages/shared/tests/raindropNativeArchitecture.test.ts packages/shared/tests/raindropIncremental.test.ts packages/shared/tests/ungroupFavourite.test.ts packages/shared/tests/widgetsOnlyGroupSync.test.ts
```

Automated regressions cover metadata encoding/validation, note preservation, real backup export/import, CRUD/duplication/replay, full/incremental Raindrop sync and hydration, browser-tab isolation, retained selection during navigation, stale layout messages, remote variant ID reassignment, and tab closure.

Chrome interaction checks use the production overlay and tab editor with an isolated local transport fixture: independent dragging/resizing, edge docking, hover hide/reveal, iframe state retention, click toggling, variant-specific edits, small viewports, blocked embedding, and Open in tab. Final installation smoke checks should load `apps/extension/dist/chrome` as an unpacked extension or `apps/extension/dist/firefox/manifest.json` as a Firefox temporary add-on, then exercise saved-item opening, reload/navigation, switching variants, sync, and reopening.
