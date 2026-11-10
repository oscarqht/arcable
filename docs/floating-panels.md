# URL-matched side panels

Open Options from the extension toolbar icon and choose **Side Panels**. Each rule has a title, an HTTP(S) panel URL, an enabled switch, and one or more matching URL patterns (one per line). Matching uses exactly the Custom JS & CSS URLPattern, wildcard, and substring semantics. Every enabled matching panel appears on normal page loads and SPA history or fragment navigation.

- New panels float at 440 × 360, within the viewport. Drag the header to move or the resize handle to resize. Free panels remember their distance to the nearest horizontal and vertical viewport edges independently. Moving or resizing picks new anchors; viewport resizing retains them. Equal distances prefer left/top.
- Select a docking edge in the header, or drag within 24 pixels of an edge. The minus button docks to the right. Dock chips remember their dock edge and the distance from their nearest end to the closest corner. Drag a chip along its edge to reposition it; equal corner distances prefer top/left. Chip overlap avoidance remains active.
- Small viewports temporarily fit panels and chips into view without changing saved sizes or anchor distances. They return to their intended placement when space returns. Older layouts acquire anchors from their initial rendered placement.
- Hover a dock chip to reveal its panel. Leaving both chip and panel hides it after 200 ms, keeping the iframe mounted.
- Click a chip (or use Enter/Space) to pin it open; activate again to hide it. Escape hides a docked panel.
- Focus the header and use arrow keys to move; Shift + arrows resize. The resize handle also accepts arrow keys.
- Choose **Float** to undock. Edit or remove definitions in Options.
- **Login not working?** offers browser-specific cookie guidance. **Open in tab** handles sites that cannot be embedded.

Definitions sync through the separate **Arcable rules** Raindrop collection. Only title, URL, matching patterns, enabled status, identifiers, and definition timestamps are synced for panels. Each browser profile persists one layout per panel in `browser.storage.local` under `arcable_panel_layouts`, shared by all matching tabs and URLs. Geometry, docking edge, and dock-chip position never enter cloud sync. Temporary reveal/pin state is not persisted. Other profiles initialize their own layouts.

Panel rules start empty. Legacy local workspace records, old Raindrop workspace collections, and bookmarks are left untouched. Existing Custom JS & CSS and Run Code rules can be read from their legacy code collections; subsequent edits are published in the separate rules collection. Startup hydration is read-only. A separate durable rule outbox keeps offline edits and changes made during a sync. Deleted-rule tombstones prevent old code rules reappearing from legacy collections. Immutable content chunks are read back before a manifest is published so long rules cannot be silently truncated.

## Webpage compatibility

The extension-owned frame requests its saved URL from the background. The background checks the current URL match, panel ID and document token before enabling compatibility and returning the URL. The host page cannot supply an arbitrary target URL through the frame URL.

- **Chrome and Firefox:** session-only `declarativeNetRequest` rules remove `X-Frame-Options` and the response `Content-Security-Policy` header for HTTP(S) subframe requests initiated by this extension, only in browser tabs with matching panels. The declarative API cannot remove just the `frame-ancestors` directive, so other response CSP directives on that panel document are also removed. Meta CSP and browser security checks still apply. Rules are removed on top-level navigation, removal of all panels and tab closure, then re-established by authorized panels as needed. Firefox MV3's blocking webRequest API refuses to weaken these headers, so both browser builds use declarative rules.
- Ordinary host-page iframes, nested iframes inside a panel website, top-level pages, scripts and other subresources retain their headers. The workaround does not alter cookies, CORS, certificates, or authentication.
- Redirects are supported. The extension retries blocked in-panel GET navigations from the extension frame, with one retry until a successful document commit re-arms future visits because site-initiated navigations do not match its narrowly scoped rule. POST submissions are never automatically replayed. Some form submissions, meta CSP policies, authentication providers, cookie restrictions, protected browser pages and site-side frame-detection scripts may still require **Open in tab**. The remote document stays sandboxed against navigating the host tab; popups may escape its sandbox for login flows.

Additional permissions are `webRequest`, `webNavigation` and `declarativeNetRequestWithHostAccess` in both builds. Existing HTTP(S) host permissions are reused. Reload the rebuilt extension and accept updated permissions when the browser requests them.

The reported GitLab pipelines URL responds with a redirect to `/users/sign_in` and `X-Frame-Options: SAMEORIGIN`. Access to the pipelines still requires an authenticated GitLab session; embedding compatibility does not grant project access.

Browser API references: [Chrome declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) and [Firefox MV3 header restrictions](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/components/extensions/webrequest/WebRequest.sys.mjs).

### Brave: signed in in a tab, signed out in the panel

Brave's cross-site cookie blocking can withhold a website's existing session in the embedded panel. This can happen after frame-header compatibility succeeds. In a disposable Brave profile, a normal tab authenticated with a fixture session cookie while the panel showed a sign-in page; allowing cookies restored the existing session in the panel.

On the **page hosting the floating panel**, open the Brave Shields (lion) menu, expand the advanced controls, set the cookie control to **Allow all cookies** for that site, then reload the hosting page. A setting on the standalone GitLab tab may not cover the panel's hosting page. Prefer the site-specific control when only that page needs the exception. See [Brave's Shields controls](https://support.brave.app/hc/en-us/articles/360022806212-How-do-I-use-Shields-while-browsing).

Adding the iframe's Storage Access sandbox permission alone does not resolve this in Brave: [Brave rejects Storage Access API permission requests](https://github.com/brave/brave-browser/wiki/Deviations-from-Chromium-(features-we-disable-or-remove)). The extension does not copy session cookies or change browser cookie settings automatically. The authenticated GitLab request in the user's own profile still needs to be checked if the site-specific exception does not resolve the issue.

## Verification

```sh
pnpm typecheck
pnpm build:extension
node apps/extension/tests/sidePanels.test.mjs
node apps/extension/tests/panelAnchoring.test.mjs
CHROME_BIN="/path/to/chrome-or-brave" node apps/extension/tests/panelAnchoring.browser.test.mjs
node apps/extension/tests/panelEmbedding.test.mjs
FIREFOX_BIN="/path/to/firefox" node apps/extension/tests/floatingPanels.firefox.test.mjs
CHROME_BIN="/path/to/brave" node apps/extension/tests/floatingPanels.embedding.test.mjs
CHROME_BIN="/path/to/chrome-or-brave" node apps/extension/tests/floatingPanels.render.test.mjs
node packages/shared/tests/rapidWorkspaceMutations.test.mjs
pnpm dlx tsx --test packages/shared/tests/raindropNativeArchitecture.test.ts packages/shared/tests/raindropIncremental.test.ts packages/shared/tests/ungroupFavourite.test.ts packages/shared/tests/widgetsOnlyGroupSync.test.ts
```

Automated regressions cover metadata encoding/validation, note preservation, real backup export/import, CRUD/duplication/replay, full/incremental Raindrop sync and hydration, browser-tab isolation, retained selection during navigation, stale layout messages, remote variant ID reassignment, and tab closure.

The rendering test runs the actual overlay in a disposable Chromium profile with extension messaging and storage mocked. It docks labels on both sides, compares their glyph dimensions with horizontal docking, and checks clipping for short, long, and multilingual labels. It saves a screenshot in the system temporary directory.

Chrome interaction checks use the production overlay and tab editor with an isolated local transport fixture: independent dragging/resizing, edge docking, hover hide/reveal, iframe state retention, click toggling, variant-specific edits, small viewports, blocked embedding, and Open in tab. Final installation smoke checks should load `apps/extension/dist/chrome` as an unpacked extension or `apps/extension/dist/firefox/manifest.json` as a Firefox temporary add-on, then exercise saved-item opening, reload/navigation, switching variants, sync, and reopening.

The embedding test requires `browser-harness` and an extension-capable Chromium executable (Brave supports command-line unpacked extension loading). It uses the built Chrome extension in a disposable profile with real messaging, storage, network header rules and the production overlay. It verifies combined XFO/CSP blocking, redirects, host CSP isolation, in-panel navigation, ordinary/nested frame isolation, dock/reveal document retention, geometry controls, Open in tab, and saved URL updates. Screenshots are saved under the system temporary directory. Set `ARCABLE_TEST_URL=https://git.insea.io/alpha/projects/chatgpt/bro/-/pipelines` to additionally verify the reported site's sign-in form without logging in.

The Firefox runtime test uses `web-ext` (resolved with pnpm) and a disposable Firefox profile. A test-only extension page and content observer verify real document loading, redirect handling, in-panel navigation, saved URL changes, repeated A-B-A-B navigation, reload persistence, cleanup, and unrelated/nested frame isolation. The production background and overlay are unchanged in the temporary test copy.

The anchoring browser test requires a Chrome extension build and an extension-capable Chromium executable (for example Brave). It uses `browser-harness` with the production overlay and mocked extension messaging/storage, then verifies real extension storage, migration and page reloads. It covers all four free-panel edge combinations, all eight dock corners, legacy migration, saved-layout remounting, move/resize updates, no writes on viewport resizing, shrink/grow restoration, and dock-chip collision avoidance. The side-panel background test verifies anchor persistence across matching tabs and worker restarts.
