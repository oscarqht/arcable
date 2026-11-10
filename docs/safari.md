# macOS Safari

Arcable has a Safari build and a reproducible macOS Xcode wrapper. Live Safari acceptance is **pending**; a successful build is not evidence that every feature works in Safari. iPhone/iPad and App Store distribution are outside this implementation.

## Build and install locally

Requirements: macOS, Xcode with its command-line tools selected (`xcode-select -p`), Node.js and the repository's pnpm version.

```sh
pnpm install --frozen-lockfile
pnpm build:shared
pnpm --filter @arcable/extension typecheck
pnpm build:extension:safari
pnpm package:safari
```

`package:safari` rebuilds the web extension and generates:

- `apps/extension/dist/safari`: Safari Web Extension resources.
- `apps/extension/build/safari/Arcable/Arcable.xcodeproj`: macOS host app and extension targets.

The generated project references the built resources. Regenerate after changing the resource file list. Packaging replaces only the generated wrapper directory; keep any hand-written native changes elsewhere. Both `dist/` and `build/` are ignored by Git. The source manifest, packaging script, and shared code are the reproducible wrapper inputs.

To compile without a development account for a local build:

```sh
xcodebuild \
  -project apps/extension/build/safari/Arcable/Arcable.xcodeproj \
  -scheme Arcable -configuration Debug \
  -derivedDataPath apps/extension/build/safari-derived \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES build
```

The result is `apps/extension/build/safari-derived/Build/Products/Debug/Arcable.app`. This run also installed a local copy at `~/Applications/Arcable Safari.app` and registered its extension with PlugInKit; that does not enable it in Safari. Open the app, then enable Arcable in **Safari → Settings → Extensions**. Local ad hoc builds may require **Safari → Settings → Advanced → Show features for web developers**, then **Develop → Developer Settings → Allow unsigned extensions**. Enable that developer option yourself only for local testing. Alternatively, select your own development team for both targets in Xcode and Run the app.

Allow website access for each site used by Arcable. Login also needs access to `oh-auth.vercel.app` and `arcable.vercel.app`; snapshots use `api.raindrop.io`. Reopen existing tabs after enabling the extension. Open Arcable's options from the extension's Safari controls. Safari-reserved shortcuts may require using Arcable's context menus instead.

Do not change the host and extension bundle identifiers independently. The extension ID must have the host ID as its prefix. The packager uses `dev.arcable.Arcable` and the converter produces its `.Extension` child.

## Feature status

The implementation column describes the intended Safari behavior. Every row still requires a live Safari check on the user's sites and account.

| Feature | Safari implementation and limitations | Verification so far |
| --- | --- | --- |
| Options, local settings, layouts | Shared options UI and `storage.local`; website permissions are explained before login | Types/build; Chromium options flow; Safari API mocks |
| Floating panels | Ordinary extension-wrapped iframes; drag, resize, dock, and Open in tab retained | Shared behavior tests; Chromium/Firefox runtime regressions |
| Embedding protected sites | Safari does not install the Chrome/Firefox header-removal rules. X-Frame-Options, CSP and third-party cookie restrictions remain. Use Open in tab | Safari mock verifies no dependency on DNR/webRequest |
| Raindrop login | Existing tab-based OAuth fallback and same-origin content bridge; no `identity` or external messaging requirement. API token login remains available | Bridge relay/origin tests; shared auth/refresh regressions; real OAuth pending |
| Raindrop manual backups | Existing save/read-back verification and confirmed replacement; JS snippets remain portable data | Shared snapshot round-trip/error tests; real Safari account pending |
| Custom CSS | Supported, including removal/reapplication when a SPA URL changes | Safari location-change/CSS tests |
| Custom JavaScript | Unavailable: Safari lacks the execution API Arcable uses. Saved snippets are preserved for export/backup and other browsers; CSS in the same rule still applies | Explicit backend rejection and UI explanation tested |
| Run Code / script background fetch | Unavailable; script context-menu entries are omitted, editor/import/export retained | Safari rejection tests; Chrome execution regression |
| Screenshots and annotation | Existing visible capture/full-page stitching and editor path retained; restricted pages cannot be captured | Builds/shared code; live Safari pending |
| Markdown | Existing injected extractor and download retained; protected browser pages unavailable | Builds; live Safari download pending |
| Clipboard | Existing page clipboard operation and text-area copy fallback retained; Safari permissions/user activation may constrain copying | Builds/shared code; live Safari pending |
| Tab switcher | Existing content overlay and tab activation retained; unavailable on browser-protected pages and when Safari reserves the keystroke | Shared background/session tests; live Safari pending |
| SPA and fragment navigation | Unsupported history/fragment extension events are optional. Safari observes location changes every 500 ms in the isolated content script, then reconciles panels and CSS | Safari simulated URL-change tests; live Safari pending |
| Automatic Picture-in-Picture | Unavailable in this Safari implementation; setting disabled without overwriting the saved preference. Use Safari's native video PiP control | Explicit Safari branch tested; Chromium auto-PiP regression |

No eval/script-tag workaround is used for Safari custom JavaScript: those approaches are blocked by many sites' CSP and would not provide the same execution contract.

## Verification record — 2026-11-11

Local environment: **macOS 27.0.1 (26A434), Safari 27.0.1, Xcode 27.2 (27B52)**. These are installed-version readings, not a claim that this machine represents Apple's latest public stable release.

- Safari production bundle built successfully. Converter emitted no unsupported manifest-key warnings after adapting the manifest.
- Generated macOS host app and embedded extension built successfully with ad hoc signing, including embedded bundle validation.
- Extension TypeScript check passed after building the shared package.
- Safari compatibility test exercises minimal Safari APIs, disabled JS execution, safe iframe fallback, OAuth content relay, and SPA panel/CSS reconciliation.
- Focused shared behavior tests cover panels, snapshots, toolbar save, tab switching, scrollbar settings, OAuth redirects and token refresh.
- Chromium installed-extension options and panel embedding regressions passed using isolated Brave profiles. The embedding fixture was updated to enter its existing mock-auth flow before opening the panel form. Firefox installed-extension embedding/navigation/persistence regression passed using an isolated Firefox profile.
- **Live Safari installation/enabling and feature checks are blocked:** native computer access returned `cgWindowNotFound` for Safari and ScreenCaptureKit error `-3811` (audio/video capture failure) for Finder. No Safari options screen or extension-enabled state could be observed. No real account login, backup, clipboard, screenshot, Markdown, or PiP result is claimed.

## Remaining Safari acceptance checklist

After restoring interactive desktop access and enabling the local extension:

1. Open options, verify the Safari notice, authenticate (OAuth and/or API token), and check settings survive a Safari restart.
2. Create two matching panels; drag, resize and dock, reload, and verify layouts. Test both an embeddable page and a protected site, then Open in tab.
3. Create a CSS-only rule and a mixed CSS/JS rule. Navigate via pushState, replaceState and a hash change; confirm styles and panels update within the polling interval, stale styles disappear, and JS stays unavailable with clear messaging.
4. Save a disposable configuration snapshot, change local test data, then explicitly confirm Load latest; verify all rule types and layouts. Do not overwrite existing configuration without reviewing the confirmation.
5. Capture viewport/full page, annotate and download; download Markdown; copy every text/link format and screenshot from a user gesture.
6. Switch among normal tabs with the overlay; try a protected page and a Safari-reserved shortcut. Confirm Safari native PiP can be used manually and the Arcable automatic option is disabled.
7. Record actual Safari/macOS versions, results, failing sites, permission prompts and limitations here before marking live Safari support verified.

References: [Apple compatibility guide](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility), [Safari extension packaging](https://developer.apple.com/safari/extensions/).
