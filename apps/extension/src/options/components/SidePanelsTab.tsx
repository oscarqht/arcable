import React, { useState, useEffect } from "react";
import browser from "webextension-polyfill";
import { Button, Card } from "@arcable/shared/components";
import type { SidePanelRule, RuleOperation } from "@arcable/shared/types";
import {
  SIDE_PANEL_RULES_KEY,
  normalizeSidePanelRules,
  isPanelUrl,
  isValidUrlPattern,
  createRuleOperation,
  generateRuleId,
} from "@arcable/shared/utils";
export function SidePanelsTab({
  showToast,
}: {
  showToast: (message: string) => void;
}) {
  const [rules, setRules] = useState<SidePanelRule[]>([]);
  const [editing, setEditing] = useState<string>();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [patterns, setPatterns] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void browser.storage.local
      .get(SIDE_PANEL_RULES_KEY)
      .then((s) => setRules(normalizeSidePanelRules(s[SIDE_PANEL_RULES_KEY])));
    const changed = (changes: Record<string, any>, area: string) => {
      if (area === "local" && changes[SIDE_PANEL_RULES_KEY])
        setRules(
          normalizeSidePanelRules(changes[SIDE_PANEL_RULES_KEY].newValue),
        );
    };
    browser.storage.onChanged.addListener(changed);
    return () => browser.storage.onChanged.removeListener(changed);
  }, []);
  const reset = () => {
    setEditing(undefined);
    setTitle("");
    setUrl("");
    setPatterns("");
    setEnabled(true);
    setError("");
  };
  const publish = async (operation: RuleOperation) => {
    const res = (await browser.runtime.sendMessage({
      type: "ARCABLE_APPLY_RULE_OPS",
      operations: [operation],
    })) as { success: boolean };
    if (!res.success) throw new Error("Could not save panel rule");
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const matches = patterns
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    if (
      !title.trim() ||
      !isPanelUrl(url.trim()) ||
      !matches.length ||
      matches.some((p) => !isValidUrlPattern(p))
    ) {
      setError(
        "Enter a title, an HTTP(S) panel URL, and at least one matching pattern.",
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const rule: SidePanelRule = {
        id: editing || generateRuleId(),
        title: title.trim(),
        url: url.trim(),
        patterns: matches,
        disabled: !enabled,
        createdAt: rules.find((r) => r.id === editing)?.createdAt || now,
        updatedAt: now,
      };
      await publish(
        createRuleOperation(
          editing ? "SIDE_PANEL_UPDATE" : "SIDE_PANEL_CREATE",
          rule.id,
          rule,
        ),
      );
      reset();
      showToast("Side panel saved");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };
  const inputStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    margin: "6px 0 18px",
    padding: 10,
    borderRadius: 8,
    border: "1px solid var(--border-input, #94a3b8)",
    color: "inherit",
    background: "var(--bg-card, transparent)",
    boxSizing: "border-box",
  };
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Card
        title="Side Panels"
        subtitle="Show panels automatically on matching websites. Rules and layouts are saved locally. Back up or restore them manually in Raindrop."
      >
        {!rules.length && <p>No side panels yet. Add your first rule below.</p>}
        {rules.map((rule) => (
          <article
            key={rule.id}
            style={{ padding: "16px 0", borderBottom: "1px solid #64748b55" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <strong style={{ flex: 1 }}>{rule.title}</strong>
              <label>
                <input
                  aria-label={`Enable ${rule.title}`}
                  type="checkbox"
                  checked={!rule.disabled}
                  onChange={async (e) => {
                    try {
                      await publish(
                        createRuleOperation("SIDE_PANEL_UPDATE", rule.id, {
                          disabled: !e.target.checked,
                        }),
                      );
                    } catch (error) {
                      showToast(String(error));
                    }
                  }}
                />{" "}
                Enabled
              </label>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(rule.id);
                  setTitle(rule.title);
                  setUrl(rule.url);
                  setPatterns(rule.patterns.join("\n"));
                  setEnabled(!rule.disabled);
                  setError("");
                }}
              >
                Edit
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  if (window.confirm(`Remove panel "${rule.title}"?`)) {
                    try {
                      await publish(
                        createRuleOperation("SIDE_PANEL_DELETE", rule.id, {}),
                      );
                      if (editing === rule.id) reset();
                    } catch (error) {
                      showToast(String(error));
                    }
                  }
                }}
              >
                Remove
              </Button>
            </div>
            <p style={{ overflowWrap: "anywhere" }}>{rule.url}</p>
            <p style={{ fontSize: 13 }}>Matches: {rule.patterns.join(", ")}</p>
          </article>
        ))}
      </Card>
      <Card title={editing ? "Edit side panel" : "Add side panel"}>
        <form onSubmit={submit}>
          <label>
            Title
            <input
              style={inputStyle}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Panel URL
            <input
              style={inputStyle}
              required
              type="url"
              placeholder="https://example.com/tools"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label>
            Matching URL patterns
            <textarea
              style={inputStyle}
              required
              rows={4}
              placeholder={"*://*.example.com/*\nhttps://another.example/*"}
              value={patterns}
              onChange={(e) => setPatterns(e.target.value)}
            />
          </label>
          <p>
            One pattern per line. Uses the same URLPattern, wildcard, and
            substring matching as Custom JS & CSS. Every enabled matching panel
            is shown.
          </p>
          <p>
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />{" "}
              Enabled
            </label>
          </p>
          {error && <p role="alert">{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save panel"}
            </Button>
            {editing && (
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
