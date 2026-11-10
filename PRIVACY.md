# Arcable Privacy

Arcable provides URL-matched side panels, custom JavaScript and CSS, manual scripts, screenshots, Markdown extraction, tab switching, and automatic Picture-in-Picture.

## Local data

Panel definitions, scripts, preferences, and Raindrop authentication tokens are stored in browser extension storage. Each browser profile keeps one local layout per panel, including position, size, docking edge, and dock-chip position. Layouts are never included in rule synchronization. Open-tab information and optional switcher previews support local browser actions.

URLs are checked locally against your configured rules. Scripts and panel websites run when their enabled rules match. Content extraction and screenshots are initiated by the corresponding browser actions. Scripts can request background fetch; those requests contact the endpoints specified by the script.

## Optional synchronization and authentication

Connecting Raindrop.io enables synchronization of panel definitions and code rules over HTTPS to `api.raindrop.io`. The separate `Arcable rules` collection contains rule definitions, content chunks, and deletion records. Existing code rules may be read from the former code-rule collections for compatibility. The removed workspace's local records, collections, and bookmarks are not modified or deleted.

OAuth uses the configured authentication service, including `oh-auth.vercel.app` and Arcable's authentication endpoints. Access and refresh tokens support your Raindrop session. Disconnect in Options to remove the locally stored authentication credentials.

## Embedded websites and scripts

Panel websites receive normal network requests and may use cookies or other website storage subject to browser settings. Arcable uses narrowly scoped, temporary embedding rules for authorized panel documents. These do not bypass site login, cookie, CORS, or certificate requirements. Custom code runs with the permissions described in Options; only install scripts you trust.

## Extension permissions

- `storage` saves preferences, rule definitions, authentication, and device-local layouts.
- `tabs` and `activeTab` support current-page tools, matching, tab switching, and screenshots.
- `scripting` and `userScripts` support configured scripts and extraction.
- `contextMenus` and `clipboardWrite` support browser actions and copying.
- `identity` supports authentication, and `alarms` supports periodic rule sync.
- `webNavigation`, `webRequest`, and `declarativeNetRequestWithHostAccess` support URL changes and scoped panel embedding.
- Host access supports URL matching, requested scripts, embedded panels, extraction, and provider requests.

## Your controls

Manage, disable, or remove rules in Options. Change site permissions in the browser's extension settings. Disconnect Raindrop to stop authenticated sync. Cloud rule data remains in your Raindrop account until you remove it there. Uninstalling the extension removes its browser-local data according to your browser's behavior; legacy cloud data is retained.
