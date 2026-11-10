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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [snapshotAction, setSnapshotAction] = useState<"save" | "load" | null>(null);
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
        "optionsInitialTab",
        "customCodePrefillUrl",
        "arcable_hide_all_scrollbars",
        "arcable_auto_pip",
      ])
      .then((s) => {
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
  const manageSnapshot = async (action: "save" | "load") => {
    if (action === "load" && !window.confirm(
      "Load the latest Raindrop snapshot? This replaces ALL local panel rules, Custom JS & CSS, Run Code rules, general settings, and saved panel layouts. Scripts in the snapshot may run on matching websites. Local changes not saved to Raindrop will be lost.",
    )) return;
    setSnapshotAction(action);
    try {
      const res = (await browser.runtime.sendMessage({
        type: action === "save" ? "ARCABLE_SAVE_SNAPSHOT" : "ARCABLE_LOAD_SNAPSHOT",
        ...(action === "load" ? { confirmOverwrite: true } : {}),
      })) as ExtensionResponse<{ savedAt: string; warning?: string }>;
      if (!res.success) throw new Error(res.error || "Snapshot operation failed");
      showToast(res.data?.warning || (action === "save"
        ? "Configuration saved to Raindrop and verified."
        : "Local configuration replaced with the latest Raindrop snapshot."));
    } catch (e) {
      showToast(String(e));
    } finally {
      setSnapshotAction(null);
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
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        <header>
          <h1>
            Arcable{" "}
            <small style={{ fontSize: 14, fontWeight: 400 }}>Options</small>
          </h1>
          <p>Side panels, scripts, and browser tools for the way you browse.</p>
        </header>
        <nav
          aria-label="Options"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            margin: "28px 0",
          }}
        >
          {tabs.map(([id, title]) => (
            <Button
              key={id}
              variant={id === activeTab ? "primary" : "outline"}
              onClick={() => setActiveTab(id)}
              aria-current={id === activeTab ? "page" : undefined}
            >
              {title}
            </Button>
          ))}
        </nav>
        {toast && (
          <p
            role="status"
            style={{
              padding: 12,
              border: "1px solid #0284c7",
              borderRadius: 8,
            }}
          >
            {toast}
          </p>
        )}
        {activeTab === "side-panels" && <SidePanelsTab showToast={showToast} />}
        {activeTab === "custom-code" && (
          <CustomCodeTab
            isDark={isDark}
            showToast={showToast}
            initialPattern={prefill}
            onClearInitialPattern={() => setPrefill(undefined)}
          />
        )}
        {activeTab === "run-code" && (
          <RunCodeTab isDark={isDark} showToast={showToast} />
        )}
        {activeTab === "sync" && (
          <Card
            title="Raindrop"
            subtitle="Manually save or restore one JSON snapshot of all rules, general settings, and panel layouts. Nothing syncs automatically."
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
                <p>Saving uploads a dated JSON file, verifies it, then removes older Arcable snapshots. Legacy rule records and unrelated bookmarks are left untouched.</p>
                <p>Loading replaces local configuration, including deleted rules and layouts. Authentication is never included.</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button onClick={() => manageSnapshot("save")} disabled={snapshotAction !== null || loading}>
                    {snapshotAction === "save" ? "Saving…" : "Save to Raindrop"}
                  </Button>
                  <Button variant="outline" onClick={() => manageSnapshot("load")} disabled={snapshotAction !== null || loading}>
                    {snapshotAction === "load" ? "Loading…" : "Load latest"}
                  </Button>
                </div>
              </>
            )}
          </Card>
        )}
        {activeTab === "about" && (
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
                    void browser.storage.local.set({
                      arcable_hide_all_scrollbars: e.target.checked,
                    });
                  }}
                />{" "}
                Hide website scrollbars
              </label>
            </p>
            <p>
              <label>
                <input
                  type="checkbox"
                  checked={autoPip}
                  onChange={(e) => {
                    void browser.storage.local.set({
                      arcable_auto_pip: e.target.checked,
                    });
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
    </div>
  );
};
