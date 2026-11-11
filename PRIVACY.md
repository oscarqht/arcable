# Arcable Privacy

Arcable provides URL-matched side panels, custom JavaScript and CSS, manual scripts, screenshots, Markdown extraction, tab switching, and automatic Picture-in-Picture.

## Local data

Panel definitions, scripts, preferences, and Raindrop authentication tokens are stored in browser extension storage. Each browser profile keeps one local layout per panel, including position, size, docking edge, and dock-chip position. Layouts are included in automatic configuration sync when connected to Raindrop. Open-tab information and optional switcher previews support local browser actions.

URLs are checked locally against your configured rules. Scripts and panel websites run when their enabled rules match. Content extraction and screenshots are initiated by the corresponding browser actions. Scripts can request background fetch; those requests contact the endpoints specified by the script.

Clicking the toolbar action saves the current page URL and title to Raindrop Unsorted and uploads a screenshot of its visible viewport as the bookmark cover.

## Optional backups and authentication

Connecting Raindrop.io enables automatic configuration sync over HTTPS to `api.raindrop.io` and Raindrop file storage. The extension fetches on browser launch, after login, shortly after local changes, and every 10 minutes while the browser is running, including with Options closed. Each upload contains one dated JSON file (uploaded as `.json.txt` for Raindrop compatibility) with panel definitions, both code-rule types, general settings, and saved positions, sizes, and docking layouts in `Arcable snapshots`. Authentication tokens, bookmarks, sync bookkeeping, and temporary UI state are excluded. The remote snapshot is validated before applying durable pending local edits and deletions; local changes win conflicts and untouched remote data is preserved. First sync uses the remote configuration when available. Pending changes remain on the device across restarts and failed requests retry automatically. Only after an upload is read back and validated are older Arcable snapshot files deleted. Legacy per-rule remote records, unrelated bookmarks, and files are left untouched.

OAuth uses the configured authentication service, including `oh-auth.vercel.app` and Arcable's authentication endpoints. Access and refresh tokens support your Raindrop session. Disconnect in Options to remove the locally stored authentication credentials.

## Embedded websites and scripts

Panel websites receive normal network requests and may use cookies or other website storage subject to browser settings. Arcable uses narrowly scoped, temporary embedding rules for authorized panel documents. These do not bypass site login, cookie, CORS, or certificate requirements. Custom code runs with the permissions described in Options; only install scripts you trust.

## Extension permissions

- `storage` saves preferences, rule definitions, authentication, and device-local layouts.
- `tabs` and `activeTab` support current-page tools, matching, tab switching, and screenshots.
- `scripting` and `userScripts` support configured scripts and extraction.
- `contextMenus` and `clipboardWrite` support browser actions and copying.
- `identity` supports authentication, and `alarms` is retained to clear the obsolete periodic rule-sync alarm on upgrade; no configuration sync is scheduled.
- `webNavigation`, `webRequest`, and `declarativeNetRequestWithHostAccess` support URL changes and scoped panel embedding.
- Host access supports URL matching, requested scripts, embedded panels, extraction, and provider requests.

## Your controls

Manage, disable, or remove rules in Options. Change site permissions in the browser's extension settings. Disconnect Raindrop to stop automatic sync. Sync replaces older Arcable snapshot files only after verification. Legacy cloud rule data remains in your Raindrop account until you remove it there. Uninstalling the extension removes its browser-local data according to your browser's behavior; legacy cloud data is retained.
