# Arcable Monorepo

Arcable is a modern, modular application suite sharing logic, types, and React UI components across:
- **`apps/extension`**: Cross-browser (Chrome & Firefox Manifest V3) browser extension built with React & TypeScript.
- **`apps/web`**: Next.js 15 web application (App Router) built with React & TypeScript.
- **`packages/shared`**: Reusable component library, hooks, utilities, and domain types.

---

## 📁 Repository Structure

```text
arcable/
├── package.json               # Root workspaces configuration
├── tsconfig.base.json         # Base TypeScript configuration
├── tsconfig.json              # Solution-level TypeScript project references
├── apps/
│   ├── extension/             # Chrome & Firefox Extension (React + Vite)
│   │   ├── manifest.chrome.json
│   │   ├── manifest.firefox.json
│   │   ├── build.mjs          # Multi-browser build runner
│   │   └── src/
│   │       ├── popup/         # Extension popup view
│   │       ├── options/       # Extension options / preferences
│   │       ├── background/    # Service worker / background script
│   │       ├── content/       # Content script
│   │       └── utils/         # Browser API helpers (webextension-polyfill)
│   └── web/                   # Next.js webapp
│       └── src/app/           # Next.js App Router pages and layouts
└── packages/
    └── shared/                # Shared package (@arcable/shared)
        └── src/
            ├── components/    # Button, Card, Header, Badge, etc.
            ├── hooks/         # useLocalStorage, etc.
            ├── utils/         # format, helpers, etc.
            └── types/         # Domain interfaces & message contracts
```

---

## 🚀 Quick Start

### 1. Installation

From the monorepo root:

```bash
npm install
```

### 2. Development

- **Run Webapp**:
  ```bash
  npm run dev:web
  ```
  Visit [http://localhost:3000](http://localhost:3000).

- **Run Extension in Dev Server**:
  ```bash
  npm run dev:extension
  ```

---

## 🔨 Building

- **Build Everything**:
  ```bash
  npm run build
  ```

- **Build Next.js Webapp**:
  ```bash
  npm run build:web
  ```

- **Build Chrome Extension**:
  ```bash
  npm run build:extension:chrome
  ```
  Output generated in: `apps/extension/dist/chrome`

- **Build Firefox Extension**:
  ```bash
  npm run build:extension:firefox
  ```
  Output generated in: `apps/extension/dist/firefox`

- **Typecheck all packages**:
  ```bash
  npm run typecheck
  ```

---

## 🧩 Loading the Extension

### In Google Chrome / Chromium / Brave / Edge:
1. Open `chrome://extensions/` in your browser.
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the directory: `apps/extension/dist/chrome`.

### In Mozilla Firefox:
1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on...**.
3. Select `apps/extension/dist/firefox/manifest.json` (or any file inside `dist/firefox`).

---

## 💧 Raindrop.io Integration

Arcable supports both **Raindrop OAuth 2.0 Login** and **Personal API Token Authentication** in both the Web App and Browser Extensions.

### Authentication Options:
1. **API Token (Instant Access)**:
   - Generate a Test/Personal Token in [Raindrop Settings → Integrations](https://app.raindrop.io/settings/integrations).
   - Paste the token directly into the Web App or Extension Options page.
2. **OAuth 2.0 (App Login)**:
   - Configure OAuth client credentials in `apps/web/.env.local`:
     ```env
     RAINDROP_CLIENT_ID=your_client_id
     RAINDROP_CLIENT_SECRET=your_client_secret
     RAINDROP_REDIRECT_URI=http://localhost:3000/api/auth/callback/raindrop
     ```
   - Click **Sign in with Raindrop OAuth** in the Web App or Extension Options.
