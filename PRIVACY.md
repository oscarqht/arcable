# Privacy Policy for Arcable

**Last Updated:** September 2, 2026  
**Effective Date:** September 2, 2026  

Thank you for choosing **Arcable** ("Arcable", "we", "us", or "our"). We are committed to respecting and protecting your privacy. This Privacy Policy explains how Arcable collects, uses, stores, and protects your information across the **Arcable Browser Extension** (Chrome, Firefox, and Chromium-based browsers) and the **Arcable Web Application**.

---

## 🛡️ Core Privacy Principles

1. **Local-First Architecture:** Your workspace configuration, spaces, folders, and tabs are stored locally on your device by default.
2. **Zero Third-Party Tracking:** We do **not** sell, rent, monetize, or share your personal data with data brokers or advertisers.
3. **No Analytics or Telemetry SDKs:** We do not embed behavioral analytics trackers, fingerprinting scripts, or third-party advertising SDKs.
4. **Direct Cloud Sync:** Synchronization is performed directly between your client (extension/web app) and your own **Raindrop.io** account via their official API.

---

## 1. Information We Collect and Process

### A. Workspace & Tab Data
When you create spaces, organize folders, or save tabs within Arcable, the following data is processed:
- **Tab Metadata:** URLs, page titles, favicons, custom titles, notes, and notification badge indicators.
- **Organization Structure:** Workspace space names, emojis, theme colors, nested folder hierarchies, pinned tabs, and favourite tabs.
- **Temporary Tabs:** Open browser tabs temporarily listed in the Arcable side panel shelf to assist with tab management.

### B. Real-Time Browser State (Extension Only)
To provide real-time tab tracking and media controls, the extension temporarily reads in-memory browser tab states:
- **Active Tab Matching:** URLs and tab IDs are monitored locally to associate open browser tabs 1-to-1 with your saved workspace items and detect diverted URLs.
- **Audio & Media State:** Tab audible and muted states are read locally to display active audio indicators and provide media playback shortcuts (play, pause, next, previous) on supported media streaming sites (e.g., YouTube, Spotify, Apple Music, SoundCloud, Bilibili).

### C. Authentication Credentials
If you choose to enable cloud synchronization with **Raindrop.io**, Arcable securely handles:
- **OAuth 2.0 Tokens / Personal Access Tokens:** Access tokens and refresh tokens provided by Raindrop.io are stored locally in `browser.storage.local` (for the extension) or secure browser storage (for the web app).
- **User Profile Info:** Basic Raindrop user profile information (User ID, display name, Pro status) returned by the Raindrop.io API for display purposes.

### D. Device Identifiers
- **Anonymized Device ID & Name:** A randomly generated client-side device identifier (e.g., `device_ext_xxxxxx`) and customizable device name (e.g., "Chrome Ext", "MacBook Web") used solely to resolve multi-device sync conflicts and manage connected devices.

---

## 2. How Your Information Is Used

We use the information strictly to provide and improve the functionality of Arcable:
- Displaying and managing your workspaces, spaces, folders, and tabs.
- Synchronizing workspaces and bookmarks with your Raindrop.io account (when enabled).
- Tracking open tabs and active playback tabs in the browser Side Panel.
- Creating local and Raindrop-based workspace backups and enabling restore functionality.

---

## 3. Data Storage & Security

- **Local Storage:** All workspace data, tab associations, custom titles, and authentication tokens are persisted locally on your device using `browser.storage.local` or standard web storage (`localStorage` / session storage).
- **Raindrop Cloud Storage:** If Raindrop sync is activated, your workspace snapshots, backup entries, and bookmarks are transmitted securely via HTTPS (`TLS 1.2+`) directly to `api.raindrop.io`.
- **Data Retention:** Your data remains stored locally until you clear extension data, uninstall the extension, or remove your data via the settings menu.

---

## 4. Browser Extension Permissions Explained

In compliance with Chrome Web Store and Mozilla Add-ons policies, here is why each permission is requested:

| Permission | Purpose |
| :--- | :--- |
| `storage` | Stores workspace data, spaces, folders, device settings, and auth tokens locally on your machine. |
| `tabs` & `activeTab` | Enables 1-to-1 tab tracking, active tab highlighting, URL reset on diverted tabs, and media playback detection. |
| `sidePanel` | Displays the Arcable workspace management interface inside the browser's persistent sidebar. |
| `identity` | Initiates the secure OAuth 2.0 login flow with Raindrop.io (`launchWebAuthFlow`). |
| `alarms` | Schedules periodic background synchronization (every 5 minutes) when Raindrop sync is enabled. |
| `host_permissions` (`https://api.raindrop.io/*`) | Communicates with the official Raindrop API for syncing bookmarks, workspaces, and backups. |
| `content_scripts` (`<all_urls>`) | Executes media controls (play/pause/skip) for audible tabs and retrieves page metadata (title/description) when saving links. |

---

## 5. Third-Party Services

Arcable integrates only with third-party services that are required to fulfill its core features:

1. **[Raindrop.io](https://raindrop.io):**
   - Used as an optional headless synchronization backend for bookmarks and workspaces.
   - Subject to the [Raindrop.io Privacy Policy](https://raindrop.io/privacy).
2. **OAuth Bridge / Web Authentication (`oh-auth.vercel.app` / `arcable.dev`):**
   - Used optionally to complete the OAuth 2.0 authorization code exchange with Raindrop.io.
   - No browsing history, workspace data, or personal information is logged or stored on the authentication bridge.
3. **CDN Assets (`cdn.jsdelivr.net`):**
   - Used for loading static assets (e.g., standard emoji/icon sets). No personal data is sent.

---

## 6. Your Rights and Data Control

You retain complete ownership and control over your data:
- **Export & Backup:** You can create manual backups of your entire workspace at any time.
- **Disconnect & Logout:** You can log out of Raindrop.io at any time, which immediately deletes all cached tokens from local extension storage.
- **Delete Data:** You can delete individual devices, remove backups, clear temporary tabs, or reset all workspace data directly from the Arcable interface.
- **Uninstall:** Removing the Arcable extension deletes all locally stored data from your browser profile.

---

## 7. Children's Privacy

Arcable does not knowingly collect or solicit any personal information from children under the age of 13 (or under 16 in the European Union). If you believe that a child has provided us with personal information, please contact us so that we can take necessary actions.

---

## 8. Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect updates to our extension or web application. Any updates will be posted in this repository with a revised "Last Updated" date.

---

## 9. Contact Us

If you have questions, feedback, or privacy-related inquiries regarding Arcable, please open an issue or reach out through our official repository:

- **GitHub Repository:** [https://github.com/oscarqht/arcable](https://github.com/oscarqht/arcable)
- **Email / Support:** Contact through repository issue tracker or repository maintainer profile.
