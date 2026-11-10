# Arcable Privacy

Arcable provides URL-matched side panels, custom JavaScript and CSS, manual scripts, screenshots, Markdown extraction, tab switching, and automatic Picture-in-Picture.

## Local data

Panel definitions, scripts, preferences, and Raindrop authentication tokens are stored in browser extension storage. Each browser profile keeps one local layout per panel, including position, size, docking edge, and dock-chip position. Layouts are included only when you manually save a configuration backup. Open-tab information and optional switcher previews support local browser actions.

URLs are checked locally against your configured rules. Scripts and panel websites run when their enabled rules match. Content extraction and screenshots are initiated by the corresponding browser actions. Scripts can request background fetch; those requests contact the endpoints specified by the script.

Clicking the toolbar action saves the current page URL and title to Raindrop Unsorted and uploads a screenshot of its visible viewport as the bookmark cover.

## Optional backups and authentication

Connecting Raindrop.io enables manual **Save to Raindrop** and **Load latest** in Options over HTTPS to `api.raindrop.io` and Raindrop file storage. Saving uploads one dated JSON file (uploaded as `.json.txt` for Raindrop compatibility) containing panel definitions, both code-rule types, general settings, and saved positions, sizes, and docking layouts to `Arcable snapshots`. Authentication tokens, bookmarks, sync bookkeeping, and temporary UI state are excluded. Only after the upload is read back and validated are older Arcable snapshot files deleted. Loading validates the newest snapshot before replacing the included local data, with an overwrite warning. Configuration is never synced automatically, and old per-rule remote records are neither read nor modified. Unrelated bookmarks and files are left untouched.

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

Manage, disable, or remove rules in Options. Change site permissions in the browser's extension settings. Disconnect Raindrop to disable authenticated backups. Saving replaces older Arcable snapshot files only after verification. Legacy cloud rule data remains in your Raindrop account until you remove it there. Uninstalling the extension removes its browser-local data according to your browser's behavior; legacy cloud data is retained.
