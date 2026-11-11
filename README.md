# Arcable

Browser tools for Chrome, Firefox, and macOS Safari, with a shared library and a small Next.js information and authentication site.

- **Side Panels:** automatically show all enabled panels whose URL patterns match the current page, including SPA navigation. Drag, resize, float, or dock using the existing panel controls.
- **Local layouts:** one persistent layout per panel per browser profile. Positions, dimensions, docking edges, and dock-chip positions persist locally and are synced through Raindrop.
- **Automatic Raindrop sync:** connect in **Options → Raindrop** to sync all three rule types, scrollbar/automatic Picture-in-Picture preferences, theme, and panel layouts. The background fetches the latest snapshot on browser launch, after login, shortly after local changes, and every 10 minutes while the browser is running, even with Options closed. Pending local edits and deletions win conflicts; untouched remote entities and settings are preserved. The first sync starts from the remote snapshot, or initializes from local configuration if none exists. Pending changes survive restarts and temporary failures retry automatically. Options shows pending, syncing, saved, or error status. Uploads use dated `.json.txt` files (JSON content with a supported TXT extension) in `Arcable snapshots`, read back and validated before older snapshots are removed. Authentication, bookmarks, and temporary state are excluded; legacy remote rule records are no longer read or modified.
- **Browser tools:** custom scripts, background fetch, context-menu actions, screenshots, copying links, Markdown downloads, tab switching, scrollbar preferences, and automatic Picture-in-Picture.

Click the extension toolbar icon to save the current page to **Raindrop Unsorted**, with a screenshot of the visible page as its cover. Connect Raindrop first in **Options**, available from the extension’s browser menu. The Side Panels tab supports titles, HTTP(S) panel URLs, enabled switches, and one or more matching patterns per rule. Patterns use the same URLPattern, wildcard, and substring behavior as Custom JS & CSS.

The former popup, native sidebar, spaces, folders, saved tabs, favourites, and workspace widgets have been removed. New panel rules start empty, with no workspace migration or deletion.

## Development

```sh
pnpm install --frozen-lockfile
pnpm build:shared
pnpm typecheck
pnpm build:extension        # Chrome, Firefox, and Safari
pnpm build:web
pnpm dev:extension          # Options at /src/options/index.html
pnpm dev:web
```

Load `apps/extension/dist/chrome` as an unpacked extension in Chrome, or load `apps/extension/dist/firefox/manifest.json` as a temporary add-on in Firefox.

For macOS Safari, run `pnpm package:safari` to generate the Xcode wrapper. See [Safari installation and feature status](docs/safari.md) for local setup, limitations, and verification status.

## Focused regression checks

```sh
pnpm test:side-panels
```

See [panel controls and compatibility](docs/floating-panels.md) for docking, login, embedding, and storage details. Authentication APIs are retained under `/api/auth`.
