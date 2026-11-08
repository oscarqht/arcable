# Floating panels

In the tab editor, use **Floating panels** to add a URL and optional title. For a tab with URL variants, select which variant owns the panels. Save the tab, then open it from the Chrome or Firefox extension.

- Drag the panel header to move it. Drag its lower-right handle to resize it.
- Select a docking edge in the header, or drag the panel within 24 pixels of an edge. The minus button docks to the right.
- Hover a dock chip to reveal its panel. Leaving both chip and panel hides it after 200 ms. The iframe stays mounted, retaining its document state while hidden.
- Click a chip (or activate it with Enter/Space) to keep the panel open; activate it again to hide it. Escape hides a docked panel. Keyboard focus keeps a revealed panel available until focus leaves.
- Focus the header and use arrow keys to move; Shift + arrow keys resize. The resize handle also accepts arrow keys.
- Choose **Float** to undock. Remove panels in the tab editor.
- Use **Login not working?** in the footer for browser-specific cookie guidance. The guide identifies the hosting site, selects Brave/Chrome/Firefox automatically where detectable, and lets you choose another browser. Close it with ×, the footer button, or Escape; opening help retains the embedded webpage and its state.
- Panel pages load through an extension-owned frame so the host tab's `frame-src` policy does not block them. The extension automatically relaxes embedding headers for panel documents. Use **Open in tab** for remaining failures.

Panels belong to the saved item or selected variant, bound to the specific browser tab opened through Arcable. Navigation and reload retain that selection; selecting another variant switches it. Unrelated tabs with matching URLs do not receive panels. Browser internal pages and other protected pages cannot receive extension content scripts.

Saving panel additions or removals updates the associated browser tab immediately from the local operation queue, without waiting for Raindrop sync. Layout changes use the same workspace operation queue and Raindrop sync. Each bookmark's note contains a dedicated `arcable-floating-panels` JSON comment; variant bookmark notes are retained during hydration. User note text and other metadata remain alongside it. Local persistence and workspace backups include these notes. Dock-chip reveal/pin state is temporary; geometry and docking edge are saved. Panels are clamped to the current viewport without overwriting the saved larger layout.

## Webpage compatibility

The extension-owned frame requests its saved URL from the background. The background checks the browser tab binding, panel ID and binding token before enabling compatibility and returning the URL. The host page cannot supply an arbitrary target URL through the frame URL.

- **Chrome and Firefox:** session-only `declarativeNetRequest` rules remove `X-Frame-Options` and the response `Content-Security-Policy` header for HTTP(S) subframe requests initiated by this extension, only in panel-bound browser tabs. The declarative API cannot remove just the `frame-ancestors` directive, so other response CSP directives on that panel document are also removed. Meta CSP and browser security checks still apply. Rules are removed on top-level navigation, removal of all panels and tab closure, then re-established by authorized panels as needed. Firefox MV3's blocking webRequest API refuses to weaken these headers, so both browser builds use declarative rules.
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
node apps/extension/tests/floatingPanels.test.mjs
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
