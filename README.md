# Arcable

Browser tools for Chrome and Firefox, with a shared library and a small Next.js information and authentication site.

- **Side Panels:** automatically show all enabled panels whose URL patterns match the current page, including SPA navigation. Drag, resize, float, or dock using the existing panel controls.
- **Local layouts:** one persistent layout per panel per browser profile. Positions, dimensions, docking edges, and dock-chip positions stay on that device.
- **Raindrop sync:** panel definitions, Custom JS & CSS, and manual Run Code rules sync in a separate `Arcable rules` collection. Existing code rules remain readable. Legacy workspace records and cloud collections/bookmarks are left untouched.
- **Browser tools:** custom scripts, background fetch, context-menu actions, screenshots, copying links, Markdown downloads, tab switching, scrollbar preferences, and automatic Picture-in-Picture.

Click the extension toolbar icon to save the current page to **Raindrop Unsorted**, with a screenshot of the visible page as its cover. Connect Raindrop first in **Options**, available from the extension’s browser menu. The Side Panels tab supports titles, HTTP(S) panel URLs, enabled switches, and one or more matching patterns per rule. Patterns use the same URLPattern, wildcard, and substring behavior as Custom JS & CSS.

The former popup, native sidebar, spaces, folders, saved tabs, favourites, and workspace widgets have been removed. New panel rules start empty, with no workspace migration or deletion.

## Development

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build:extension        # Chrome and Firefox
pnpm build:web
pnpm dev:extension          # Options at /src/options/index.html
pnpm dev:web
```

Load `apps/extension/dist/chrome` as an unpacked extension in Chrome, or load `apps/extension/dist/firefox/manifest.json` as a temporary add-on in Firefox.

## Focused regression checks

```sh
pnpm test:side-panels
```

See [panel controls and compatibility](docs/floating-panels.md) for docking, login, embedding, and storage details. Authentication APIs are retained under `/api/auth`.
