# Arcable

<p align="center">
  <img src="docs/poster.jpeg" alt="Arcable Poster" width="100%" />
</p>

<p align="center">
  <strong>An Arc-style tab and workspace manager with native Raindrop.io cloud sync for Chrome, Firefox, and the Web.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.80.0-blue.svg" alt="Version 0.80.0" />
  <img src="https://img.shields.io/badge/Manifest-V3-blue.svg" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Next.js-15-black.svg" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-19-61dafb.svg" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178c6.svg" alt="TypeScript 5.7" />
  <img src="https://img.shields.io/badge/Sync-Raindrop.io_Native_v2-0080ff.svg" alt="Raindrop Sync Native v2" />
</p>

---

## ✨ Features

### 🌌 Arc-Inspired Spaces & Workspace Hierarchy
- **Custom Spaces**: Create and organize multiple spaces with dedicated icons, emojis, color tokens, and custom ordering.
- **Convert Spaces ↔ Folders**: Convert any Space into a nested Folder inside another Space with full preservation of children, and vice-versa.
- **Multi-Level Nested Folders**: Hierarchical collapsible folders with custom emojis, colors, and persistent expansion state.
- **URL Variants**: Store multiple URL endpoints under a single tab (e.g., *App*, *Issues*, *Pull Requests*, *Docs*) using native Raindrop naming conventions (`<name> ||| <variant>`), with quick-switch access.
- **Favourites Shelf**: Global favourite tabs shelf pinned at the top level and accessible across all spaces.
- **Pinned Tabs Shelf**: Keep high-priority tabs persistently docked at the top of each individual space.
- **Temporary Tabs Shelf (TmpTabs)**: Capture active browser tabs into an unorganized scratchpad shelf with one-click actions to promote into spaces, rename, or dismiss.
- **Virtual Synced Open Tabs**: Cross-device open tabs view displaying active tabs across all connected machines with device badges and playback indicators.
- **Centralized Drag & Drop**: Smooth reordering and moving of tabs and folders across spaces, shelves, and nested hierarchies.
- **Focus & Grid Views**: Toggle between an all-spaces **Grid View** overview and a focused, distraction-free **Single Space View**.

---

### 🖥️ Side Panel & Real-Time Browser Tab Tracking
- **Persistent Side Panel UI**: Native sidebar interface in Chrome, Chromium-based browsers, and Mozilla Firefox / Zen Browser.
- **1-to-1 Live Tab Tracking**: Automatically associates open browser tabs with saved workspace items, highlighting and scrolling to active tabs in real time.
- **Diverted URL Detection & Reset**: Identifies when an active tab has navigated away from its original saved URL and offers a one-click button to reset back to the saved address.
- **Audible Tabs Floating Widget**: Automatically detects tabs playing audio across the browser; displays a floating pill widget with animated sound waves, one-click tab activation, and instant mute/unmute toggling.
- **Media Controls**: Quick play/pause and media playback controls directly on active tabs for major platforms (YouTube, Spotify, Apple Music, Bilibili, and more).

---

### 🔄 Raindrop.io Native Architecture v2
- **True Native Collection & Bookmark Sync**: Spaces and folders map directly to native Raindrop collections; tabs map to native bookmarks.
- **Clean Raindrop Footprint**: Completely eliminates JSON metadata dumping into bookmark excerpts and notes, decommissioning legacy `data.json.txt` files.
- **Arcable v2 Root Isolation**: Uses an isolated `Arcable v2` root collection to safeguard data from older client versions.
- **Automatic Migration Engine**: Automatically detects legacy `Arcable` roots, migrates child spaces and bookmarks to `Arcable v2`, and safely cleans up old roots.
- **Native Manual Sorting Order**: Respects Raindrop's native manual bookmark order (`sort=-sort`) and guarantees items are grouped before folders in sibling sorting.
- **Integrated Raindrop Search**: The workspace search bar seamlessly queries both local workspace items and your entire Raindrop bookmark library.
- **Raindrop Cover Search**: Search and select collection covers powered directly by Raindrop's collection cover search API.
- **Multi-Device Conflict Resolution**: Pending operation queues and an operation replay engine ensure reliable sync across devices.

---

### 🧩 Interactive Productivity Widgets
Embedded directly in the workspace, supporting small, medium, and large sizes with drag-and-drop reordering:
- **Digital Clock**: Minimalist digital clock with 12/24-hour display.
- **Analog Clock**: Modern clock face with animated hands.
- **Calendar**: Month calendar widget with current date highlighting.
- **Date & Time (Combo)**: Unified clock and date indicator.
- **Pomodoro Timer**: Focus and break intervals with audio/visual countdown alerts.
- **Countdown Widget**: Event and deadline countdown tracker.
- **Sticky Notes**: Quick notepad cards with 6 vibrant color themes (*Yellow, Green, Pink, Blue, Purple, Slate*).
- **Live Weather**: Weather conditions and temperature with city/coordinate lookup.
- **Quick Search Popover**: Multi-engine search shortcut right inside the shelf.
- *All widgets sync seamlessly to Raindrop under the root collection tagged `#arcable-widget`.*

---

### ⚡ Userscripts & Custom Code Engine (Extension)
- **Run Code in Page**: Execute custom JavaScript userscripts on matching URL patterns.
- **Custom CSS Rules**: Inject custom stylesheets per domain or URL pattern.
- **Integrated Ace Editor**: Full syntax-highlighted code and stylesheet editing in the Extension Options page.
- **Background Fetch Proxy (`arcableFetch`)**: Built-in background fetch bridge allowing userscripts to bypass page-level CORS limitations.
- **Context Menus & Quick-Run Popup**: Right-click on any matching webpage or trigger scripts directly from the extension popup.
- **Cloud Synced**: Code rules and custom stylesheets are synced securely via dedicated `_custom_css` and `_run_code` Raindrop system collections.
- **Nenya Rule Migration**: Easily import script and style rules exported from Nenya.

---

### 📱 Device Presence & Workspace Backups
- **Connected Device Management**: View connected clients with auto-detected platform badges (Chrome, Firefox, Zen Browser, Brave, Arc, Vivaldi, macOS, Windows, iOS, Android, and Web App).
- **Custom Device Renaming & Pruning**: Assign custom names to devices or prune inactive sessions.
- **JSON Backup & Restore**: Export full workspace snapshots to timestamped `.json` files, inspect structural summaries (spaces, folders, tabs), and safely restore or merge backups.

---

### 🌓 Responsive & Theme-Aware
- Automatic Dark / Light mode detection aligned with system preferences or custom space themes.
- Responsive Next.js web application designed for desktop, tablet, and mobile screens.

---

## 📁 Repository Structure

```text
arcable/
├── package.json               # Root monorepo workspace configuration (npm workspaces)
├── tsconfig.base.json         # Base TypeScript configuration
├── tsconfig.json              # TypeScript solution references
├── docs/                      # Assets, icons, CI/CD publishing guides
│   ├── icon.png
│   ├── poster.jpeg
│   └── CI_STORE_PUBLISH.md    # Automated store deployment guide
├── apps/
│   ├── extension/             # Chrome & Firefox Extension (React 19, Vite 6, Manifest V3)
│   │   ├── manifest.chrome.json
│   │   ├── manifest.firefox.json
│   │   ├── build.mjs          # Multi-browser build runner (Chrome & Firefox)
│   │   └── src/
│   │       ├── sidepanel/     # Arcable Side Panel UI (active space memory, tab tracker)
│   │       ├── popup/         # Extension popup with quick save & code snippet triggers
│   │       ├── options/       # Settings, Raindrop auth, Ace Code Editor (JS & CSS)
│   │       ├── background/    # Service worker, context menus, runCode runner, tab tracker
│   │       ├── content/       # Content scripts, CSS/JS injection, OAuth bridge
│   │       └── utils/         # Tab tracker, audio tracker, browser polyfill
│   └── web/                   # Next.js 15 Web Application (App Router, React 19)
│       └── src/
│           ├── app/           # App Router pages, layouts, and sync API routes
│           └── lib/           # Server-side Raindrop API client
└── packages/
    └── shared/                # Shared package (@arcable/shared)
        └── src/
            ├── components/    # WorkspaceManager, SpaceCard, Shelves, Modals, Widgets
            │   └── workspace/widgets/ # Pomodoro, Countdown, StickyNote, Weather, QuickSearch
            ├── hooks/         # useWorkspace, useLocalStorage, useSystemTheme, useIsMobile
            ├── utils/         # raindropSync (Native v2), syncEngine, spaceTheme, workspaceBackup
            ├── types/         # Workspace, Sync, TabTracker, Raindrop, and CustomCode interfaces
            └── assets/        # Browser & OS device icons, logos
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

- **Run Extension in Watch Mode**:
  ```bash
  npm run dev:extension
  ```

- **Build Development Version of Extensions**:
  ```bash
  npm run build:extension:dev
  # or specifically:
  npm run build:extension:dev:chrome
  npm run build:extension:dev:firefox
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
  Output directory: `apps/extension/dist/chrome`

- **Build Firefox Extension (Manifest V3)**:
  ```bash
  npm run build:extension:firefox
  ```
  Output directory: `apps/extension/dist/firefox`

- **Typecheck Entire Codebase**:
  ```bash
  npm run typecheck
  ```

---

## 🧩 Loading the Extension

### In Chrome / Chromium / Brave / Edge:
1. Navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select `apps/extension/dist/chrome`.
5. Open the Side Panel from your browser toolbar or extension icon to access Arcable.

### In Mozilla Firefox / Zen Browser:
1. Navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `apps/extension/dist/firefox/manifest.json` (or any file within `dist/firefox`).
4. Open the Firefox sidebar to view Arcable.

---

## 💧 Raindrop.io Integration

Arcable natively synchronizes with **Raindrop.io** via OAuth 2.0 or a Personal Access Token.

### 1. Personal Access Token (Quick Start)
1. Navigate to [Raindrop Settings → Integrations](https://app.raindrop.io/settings/integrations).
2. Create a **Test / Personal Token**.
3. Paste the token into the Arcable Web App or Extension Settings/Options page.

### 2. OAuth 2.0 Configuration
1. Register an application in the [Raindrop Developer Console](https://developer.raindrop.io/).
2. Add your credentials to `apps/web/.env.local`:
   ```env
   RAINDROP_CLIENT_ID=your_client_id
   RAINDROP_CLIENT_SECRET=your_client_secret
   RAINDROP_REDIRECT_URI=http://localhost:3000/api/auth/callback/raindrop
   ```
3. Click **Sign in with Raindrop OAuth** in the Web App or Extension.

---

## 🛡️ Privacy & Security

- **Local-First**: Workspace data is kept local by default and works fully offline.
- **Zero Tracking**: No tracking cookies, analytics SDKs, behavioral fingerprinting, or ads.
- **Direct Sync**: Synchronization connects directly between your browser and the official Raindrop.io API.
- For full details, see [PRIVACY.md](PRIVACY.md).

---

## 📄 License

MIT

