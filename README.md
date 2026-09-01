# Arcable

<p align="center">
  <img src="docs/poster.jpeg" alt="Arcable Poster" width="100%" />
</p>

<p align="center">
  <strong>An Arc-style tab and workspace manager with Raindrop.io cloud sync for Chrome, Firefox, and the Web.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue.svg" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Next.js-15-black.svg" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-18-61dafb.svg" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178c6.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Sync-Raindrop.io-0080ff.svg" alt="Raindrop Sync" />
</p>

---

## ✨ Features

- 🌌 **Arc-Inspired Spaces & Organization**
  - **Custom Spaces**: Create and organize multiple spaces with dedicated emoji icons, themes, and custom ordering.
  - **Nested Folders**: Multi-level collapsible folders with custom emojis and color tags.
  - **Favourites Shelf**: Top-level global favourite tabs shelf accessible across your workflow.
  - **Pinned Tabs**: Keep essential links pinned at the top of each space.
  - **Temporary / Unorganized Tabs**: Capture active browser tabs into a temporary shelf with quick actions to promote or dismiss.

- 🖥️ **Side Panel & Real-Time Tab Tracking**
  - **Side Panel Interface**: Persistent sidebar UI in Chrome and Firefox Side Panels.
  - **1-to-1 Live Tab Tracking**: Synchronizes with open browser tabs, auto-reveals and highlights the active tab item.
  - **Diverted URL Detection**: Detects URL changes and allows one-click reset back to the original saved tab.

- 🔄 **Robust Raindrop.io Cloud Sync**
  - **Headless Backend Sync**: Uses Raindrop.io as a synchronized backend for bookmarks, spaces, and collections.
  - **Operation Replay Engine**: Multi-device conflict resolution with pending operation queues and replay support.
  - **Device Management**: View and manage connected devices with customizable device names.
  - **Dual Auth Modes**: Supports both OAuth 2.0 login and Personal API token authentication.

- 🖐️ **Centralized Drag & Drop**
  - Reorder tabs and folders smoothly across spaces, shelves, and nested folders.

- 🔍 **Instant Search & Focus Views**
  - Instant fuzzy/keyword search across all spaces, folders, and tabs.
  - Toggle between **Grid View** (all spaces overview) and **Focused View** (single space workspace).

- 🌓 **Theme-Aware & Responsive**
  - Automatic Dark / Light mode detection aligned with system preferences.
  - Mobile-responsive web dashboard.

---

## 📁 Repository Structure

```text
arcable/
├── package.json               # Root monorepo workspace configuration
├── tsconfig.base.json         # Base TypeScript configuration
├── tsconfig.json              # TypeScript solution references
├── docs/                      # Assets, icons, and poster previews
│   ├── icon.png
│   └── poster.jpeg
├── apps/
│   ├── extension/             # Chrome & Firefox Extension (React + Vite, Manifest V3)
│   │   ├── manifest.chrome.json
│   │   ├── manifest.firefox.json
│   │   ├── build.mjs          # Multi-browser build runner
│   │   └── src/
│   │       ├── sidepanel/     # Arcable Side Panel UI
│   │       ├── popup/         # Extension popup view
│   │       ├── options/       # Settings & Raindrop authentication
│   │       ├── background/    # Service worker & tab tracker
│   │       ├── content/       # Content scripts & OAuth bridge
│   │       └── utils/         # Browser API helpers (webextension-polyfill)
│   └── web/                   # Next.js 15 Web Application (App Router)
│       └── src/
│           ├── app/           # App Router pages, layouts, and sync API routes
│           └── lib/           # Server-side Raindrop API client
└── packages/
    └── shared/                # Shared package (@arcable/shared)
        └── src/
            ├── components/    # WorkspaceManager, SpaceCard, Modals, Buttons, Shelves
            ├── hooks/         # useWorkspace, useLocalStorage, useSystemTheme, useIsMobile
            ├── utils/         # syncEngine, raindropSync, dragState, format
            └── types/         # Workspace, Sync, TabTracker, and Raindrop interfaces
```

---

## 🚀 Quick Start

### 1. Installation

```bash
npm install
```

### 2. Development

- **Run Next.js Web App**:
  ```bash
  npm run dev:web
  ```
  Open [http://localhost:3000](http://localhost:3000).

- **Run Extension in Development Mode**:
  ```bash
  npm run dev:extension
  ```

---

## 🔨 Building

- **Build All Workspaces**:
  ```bash
  npm run build
  ```

- **Build Next.js Web App**:
  ```bash
  npm run build:web
  ```

- **Build Chrome Extension (Manifest V3)**:
  ```bash
  npm run build:extension:chrome
  ```
  Output: `apps/extension/dist/chrome`

- **Build Firefox Extension (Manifest V3)**:
  ```bash
  npm run build:extension:firefox
  ```
  Output: `apps/extension/dist/firefox`

- **Typecheck Codebase**:
  ```bash
  npm run typecheck
  ```

---

## 🧩 Loading the Extension

### In Chrome / Chromium / Brave / Edge:
1. Navigate to `chrome://extensions/`.
2. Turn on **Developer mode** (top-right switch).
3. Click **Load unpacked**.
4. Select `apps/extension/dist/chrome`.
5. Open the Side Panel from the browser toolbar or extension icon to access Arcable.

### In Mozilla Firefox:
1. Navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `apps/extension/dist/firefox/manifest.json` (or any file within `dist/firefox`).

---

## 💧 Raindrop.io Integration

Arcable supports synchronization via **Raindrop OAuth 2.0** or a **Personal Access Token**.

### 1. Personal Access Token (Quick Start)
1. Go to [Raindrop Settings → Integrations](https://app.raindrop.io/settings/integrations).
2. Create a **Test / Personal Token**.
3. Paste the token into the Arcable Web App or Extension Options page.

### 2. OAuth 2.0 Configuration
1. Register an application in the [Raindrop Developer Console](https://developer.raindrop.io/).
2. Set up your environment variables in `apps/web/.env.local`:
   ```env
   RAINDROP_CLIENT_ID=your_client_id
   RAINDROP_CLIENT_SECRET=your_client_secret
   RAINDROP_REDIRECT_URI=http://localhost:3000/api/auth/callback/raindrop
   ```
3. Click **Sign in with Raindrop OAuth** in the Web App or Extension.

---

## 📄 License

MIT
