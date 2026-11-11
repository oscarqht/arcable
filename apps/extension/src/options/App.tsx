import type { SyncStatus } from "../background/configSync";
import { updateConfiguration } from "../utils/configuration";
import React, { useState, useEffect } from "react";
import "../utils/raindropSession";
import { Button, Card, RaindropAuthCard } from "@arcable/shared/components";
import type {
  RaindropAuthState,
  ExtensionResponse,
} from "@arcable/shared/types";
import { useSystemTheme } from "@arcable/shared/hooks";
import browser from "webextension-polyfill";
import { CustomCodeTab } from "./components/CustomCodeTab";
import { RunCodeTab } from "./components/RunCodeTab";
import { SidePanelsTab } from "./components/SidePanelsTab";
import { isSafari, SAFARI_SCRIPT_LIMITATION } from "../utils/browser";
const tabs = [
  ["sync", "Raindrop"],
  ["side-panels", "Side Panels"],
  ["custom-code", "Custom JS & CSS"],
  ["run-code", "Run Code"],
  ["about", "Settings & About"],
] as const;
export const App: React.FC = () => {
  const { isDark } = useSystemTheme();
  const [activeTab, setActiveTab] = useState<string>(tabs[0][0]);
  const [auth, setAuth] = useState<RaindropAuthState>({
    isAuthenticated: false,
  });
  const visibleTabs = auth.isAuthenticated ? tabs : tabs.filter(([id]) => id === "sync");
  const visibleTab = auth.isAuthenticated ? activeTab : "sync";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: "pending" });
  const [prefill, setPrefill] = useState<string>();
  const [hideScrollbars, setHideScrollbars] = useState(true);
  const [autoPip, setAutoPip] = useState(true);
  const showToast = (message: string) => {
    setToast(message);
  };
  const refreshAuth = async () => {
    const res = (await browser.runtime.sendMessage({
      type: "RAINDROP_GET_AUTH_STATE",
    })) as ExtensionResponse<RaindropAuthState>;
    if (res.data) setAuth(res.data);
  };
  useEffect(() => {
    void refreshAuth()
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    void browser.storage.local
      .get([
        "arcable_config_sync",
        "optionsInitialTab",
        "customCodePrefillUrl",
        "arcable_hide_all_scrollbars",
        "arcable_auto_pip",
      ])
      .then((s) => {
        const storedSync = s.arcable_config_sync as { status?: typeof syncStatus } | undefined;
        if (storedSync?.status) setSyncStatus(storedSync.status);
        if (tabs.some(([id]) => id === s.optionsInitialTab))
          setActiveTab(s.optionsInitialTab as string);
        if (s.customCodePrefillUrl) {
          setPrefill(s.customCodePrefillUrl as string);
          setActiveTab("custom-code");
        }
        setHideScrollbars(s.arcable_hide_all_scrollbars !== false);
        setAutoPip(s.arcable_auto_pip !== false);
        void browser.storage.local.remove([
          "optionsInitialTab",
          "customCodePrefillUrl",
        ]);
      });
    const changed = (changes: Record<string, any>, area: string) => {
      if (area !== "local") return;
      if (changes.arcable_config_sync?.newValue?.status) setSyncStatus(changes.arcable_config_sync.newValue.status);
      if (changes.arcable_raindrop_auth)
        setAuth(
          changes.arcable_raindrop_auth.newValue || { isAuthenticated: false },
        );
      if (changes.arcable_hide_all_scrollbars)
        setHideScrollbars(
          changes.arcable_hide_all_scrollbars.newValue !== false,
        );
      if (changes.arcable_auto_pip)
        setAutoPip(changes.arcable_auto_pip.newValue !== false);
    };
    browser.storage.onChanged.addListener(changed);
    return () => browser.storage.onChanged.removeListener(changed);
  }, []);
  useEffect(() => {
    if (!loading && !auth.isAuthenticated) setActiveTab("sync");
  }, [auth.isAuthenticated, loading]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const authenticate = async (type: string, payload?: any) => {
    setLoading(true);
    setError(null);
    try {
      const res = (await browser.runtime.sendMessage({
        type,
        payload,
      })) as ExtensionResponse<RaindropAuthState>;
      if (!res.success) throw new Error(res.error || "Authentication failed");
      await refreshAuth();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div
      style={{
        minHeight: "100vh",
        background: isDark ? "#0f172a" : "#f8fafc",
        color: isDark ? "#e2e8f0" : "#172033",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: auth.isAuthenticated ? "40px 24px 180px" : "40px 24px" }}>
        <header>
          <h1>
            Arcable{" "}
            <small style={{ fontSize: 14, fontWeight: 400 }}>Options</small>
          </h1>
          <p>Side panels, scripts, and browser tools for the way you browse.</p>
        </header>
        {isSafari() && (
          <aside role="note" style={{ padding: 16, border: "1px solid #d97706", borderRadius: 8, marginBottom: 16 }}>
            <strong>Safari support</strong>
            <p>Allow Arcable access to websites in Safari Settings → Extensions. Login opens a tab; allow access to oh-auth.vercel.app and arcable.vercel.app to complete it. You can also use a Raindrop API token below.</p>
            <p>{SAFARI_SCRIPT_LIMITATION}</p>
            <p>Panels use normal iframes. Sites that block embedding or require third-party cookies may need Open in tab. Automatic Picture-in-Picture is unavailable; use Safari’s video Picture-in-Picture control. Use context menus for shortcuts reserved by Safari.</p>
          </aside>
        )}
        <nav
          aria-label="Options"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            margin: "28px 0",
          }}
        >
          {visibleTabs.map(([id, title]) => (
            <Button
              key={id}
              variant={id === visibleTab ? "primary" : "outline"}
              onClick={() => setActiveTab(id)}
              aria-current={id === visibleTab ? "page" : undefined}
            >
              {title}
            </Button>
          ))}
        </nav>
        {visibleTab === "side-panels" && <SidePanelsTab showToast={showToast} />}
        {visibleTab === "custom-code" && (
          <CustomCodeTab
            isDark={isDark}
            showToast={showToast}
            initialPattern={prefill}
            onClearInitialPattern={() => setPrefill(undefined)}
          />
        )}
        {visibleTab === "run-code" && (
          <RunCodeTab isDark={isDark} showToast={showToast} />
        )}
        {visibleTab === "sync" && (
          <Card
            title="Raindrop"
            subtitle="Automatically sync all rules, general settings, and panel layouts with Raindrop."
          >
            <RaindropAuthCard
              authState={auth}
              isLoading={loading}
              errorMessage={error}
              onLoginWithToken={(token) =>
                authenticate("RAINDROP_LOGIN_TOKEN", { token })
              }
              onLoginWithOAuth={() => authenticate("RAINDROP_START_OAUTH")}
              onLogout={() => authenticate("RAINDROP_LOGOUT")}
            />
            {auth.isAuthenticated && (
              <>
                <p>Sync runs on browser launch, after login and local changes, and every 10 minutes while the browser is running—even with Options closed.</p>
                <p>Remote changes are fetched first, then pending local edits and deletions are applied. Your pending changes win conflicts. Authentication is never included.</p>
              </>
            )}
          </Card>
        )}
        {visibleTab === "about" && (
          <Card
            title="Settings & About"
            subtitle={`Arcable ${browser.runtime.getManifest().version}`}
          >
            <p>The toolbar button saves the current page to Raindrop Unsorted with a screenshot cover. Open Options from the extension’s browser menu.</p>
            <p>
              <label>
                <input
                  type="checkbox"
                  checked={hideScrollbars}
                  onChange={(e) => {
                    void updateConfiguration({
                      arcable_hide_all_scrollbars: e.target.checked,
                    }).catch(() => showToast("Could not save scrollbar preference."));
                  }}
                />{" "}
                Hide website scrollbars
              </label>
            </p>
            <p>
              <label>
                <input
                  type="checkbox"
                  checked={!isSafari() && autoPip}
                  disabled={isSafari()}
                  onChange={(e) => {
                    void updateConfiguration({
                      arcable_auto_pip: e.target.checked,
                    }).catch(() => showToast("Could not save Picture-in-Picture preference."));
                  }}
                />{" "}
                Automatic Picture-in-Picture on tab switch
              </label>
            </p>
            <p>
              Use the context menu for scripts, copying links, screenshots, and
              Markdown downloads.
            </p>
            <p>
              <a href="https://raindrop.io" target="_blank" rel="noreferrer">
                Raindrop.io
              </a>
            </p>
          </Card>
        )}
      </main>
      {(auth.isAuthenticated || toast) && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            zIndex: 100,
            maxWidth: "calc(100vw - 32px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 8,
          }}
        >
          {toast && (
            <p
              role="status"
              style={{
                padding: 12,
                border: "1px solid #0284c7",
                borderRadius: 8,
                margin: 0,
                maxWidth: 420,
                overflowWrap: "anywhere",
                background: isDark ? "#1e293b" : "#ffffff",
              }}
            >
              {toast}
            </p>
          )}
          {auth.isAuthenticated && (
            <div
              role="status"
              aria-live="polite"
              aria-label="Raindrop sync status"
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "flex-end",
                gap: 8,
                padding: 12,
                borderRadius: 10,
                border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                background: isDark ? "#1e293b" : "#ffffff",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
              }}
            >
              <span>
                {syncStatus.state === "syncing" ? "Syncing with Raindrop…"
                  : syncStatus.state === "saved" ? "Saved to Raindrop"
                  : syncStatus.state === "error" ? syncStatus.error || "Sync failed. Retrying automatically."
                  : "Changes pending sync…"}
                {syncStatus.lastSyncedAt && <small style={{ display: "block" }}>Last synced: {new Date(syncStatus.lastSyncedAt).toLocaleString()}</small>}
                {syncStatus.warning && <small style={{ display: "block" }}>{syncStatus.warning}</small>}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
