"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  readFloatingPanels,
  writeFloatingPanels,
  type FloatingPanel,
} from "../../utils/floatingPanels";

export function FloatingPanelEditor({
  note,
  onChange,
  isDark,
}: {
  note?: string;
  onChange: (note: string) => void;
  isDark?: boolean;
}) {
  const [panels, setPanels] = useState(() => readFloatingPanels(note));
  const lastNote = useRef(note);
  useEffect(() => {
    if (note !== lastNote.current) {
      lastNote.current = note;
      setPanels(readFloatingPanels(note));
    }
  }, [note]);
  const update = (next: FloatingPanel[]) => {
    setPanels(next);
    const nextNote = writeFloatingPanels(note, next);
    lastNote.current = nextNote;
    onChange(nextNote);
  };
  const field: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "7px 9px",
    border: "1px solid #94a3b8",
    borderRadius: 6,
    background: "transparent",
    color: "inherit",
  };
  return (
    <section
      style={{
        margin: "16px 0",
        display: "grid",
        gap: 8,
        color: isDark ? "#f8fafc" : "#0f172a",
        colorScheme: isDark ? "dark" : "light",
      }}
      aria-label="Floating panels"
    >
      <strong style={{ fontSize: 13 }}>Floating panels</strong>
      <small>
        Panels open above this page in the Arcable extension. Each URL variant
        has its own panels. Some websites block embedding; use Open in tab.
      </small>
      {panels.map((panel, index) => (
        <div
          key={panel.id}
          style={{
            border: "1px solid #94a3b8",
            borderRadius: 8,
            padding: 8,
            display: "grid",
            gap: 6,
          }}
        >
          <input
            aria-label={`Panel ${index + 1} title`}
            placeholder="Title (optional)"
            style={field}
            value={panel.title || ""}
            onChange={(e) =>
              update(
                panels.map((p) =>
                  p.id === panel.id ? { ...p, title: e.target.value } : p,
                ),
              )
            }
          />
          <input
            aria-label={`Panel ${index + 1} URL`}
            type="url"
            pattern="https?://.*"
            required
            placeholder="https://…"
            style={field}
            value={panel.url}
            onChange={(e) =>
              update(
                panels.map((p) =>
                  p.id === panel.id ? { ...p, url: e.target.value } : p,
                ),
              )
            }
          />
          <div style={{ display: "flex", gap: 8 }}>
            <select
              aria-label={`Panel ${index + 1} dock`}
              value={panel.dock || ""}
              onChange={(e) =>
                update(
                  panels.map((p) =>
                    p.id === panel.id
                      ? {
                          ...p,
                          dock: (e.target.value ||
                            undefined) as FloatingPanel["dock"],
                        }
                      : p,
                  ),
                )
              }
            >
              <option value="">Floating</option>
              {["left", "right", "top", "bottom"].map((edge) => (
                <option key={edge} value={edge}>
                  Dock {edge}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => update(panels.filter((p) => p.id !== panel.id))}
            >
              Remove panel
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        style={{ ...field, cursor: "pointer" }}
        onClick={() =>
          update([
            ...panels,
            {
              id: crypto.randomUUID(),
              url: "",
              x: 48 + panels.length * 24,
              y: 48 + panels.length * 24,
              width: 440,
              height: 360,
            },
          ])
        }
      >
        + Add floating panel
      </button>
    </section>
  );
}
