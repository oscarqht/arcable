import browser from "webextension-polyfill";
import { nearestDockPosition } from "./dockPosition";
import { createLoginHelp } from "./loginHelp";
import {
  clampPanel,
  anchorPanel,
  positionPanel,
  nearestPanelAnchor,
  anchoredPosition,
  type FloatingPanel,
} from "../../../../packages/shared/src/utils/floatingPanels";

type View = {
  panel: FloatingPanel;
  element: HTMLElement;
  chip: HTMLButtonElement;
  frame: HTMLIFrameElement;
  title: HTMLElement;
  select: HTMLSelectElement;
  timer?: ReturnType<typeof setTimeout>;
  pinned: boolean;
  hovering: boolean;
  visible: boolean;
  show: (visible: boolean) => void;
  layout: () => void;
};
export function initFloatingPanels() {
  if (window.top !== window) return;
  let token: string | undefined;
  let host: HTMLDivElement | undefined;
  let shadow: ShadowRoot;
  const views = new Map<string, View>();
  let layer = 1;
  let documentVersion = 0;
  let theme: "light" | "dark" | "system" = "system";
  const applyTheme = (config: { theme?: string } | undefined) => {
    theme =
      config?.theme === "dark" || config?.theme === "light"
        ? config.theme
        : "system";
    if (host) host.dataset.theme = theme;
  };
  void browser.storage.local
    .get("arcable_config")
    .then((stored) =>
      applyTheme(stored.arcable_config as { theme?: string } | undefined),
    )
    .catch(() => {});
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.arcable_config)
      applyTheme(
        changes.arcable_config.newValue as { theme?: string } | undefined,
      );
  });

  let keyboardInteraction = false;
  window.addEventListener(
    "keydown",
    () => {
      keyboardInteraction = true;
    },
    true,
  );
  window.addEventListener(
    "pointerdown",
    () => {
      keyboardInteraction = false;
    },
    true,
  );
  window.addEventListener(
    "pointermove",
    () => {
      keyboardInteraction = false;
    },
    true,
  );
  function setup() {
    if (host) return;
    host = document.createElement("div");
    host.setAttribute("data-arcable-floating-panels", "");
    // A manual popover places overlays above page stacking contexts without a modal backdrop.
    host.setAttribute("popover", "manual");
    host.style.cssText =
      "all:initial!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;overflow:visible!important;pointer-events:none!important;z-index:2147483647!important;";
    host.dataset.theme = theme;
    shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    const lightTheme = `
      --panel-scheme:light; --panel-surface:#ffffff; --panel-chrome:#f1f5f9;
      --panel-text:#172033; --panel-muted:#526176; --panel-border:#cbd5e1;
      --panel-control:#f8fafc; --panel-control-border:#b8c4d4; --panel-hover:#e2e8f0;
      --panel-accent:#0369a1; --panel-active:#e0f2fe;
      --panel-shadow:0 16px 48px #0f172a30,0 2px 8px #0f172a14;
    `;
    const darkTheme = `
      --panel-scheme:dark; --panel-surface:#171b21; --panel-chrome:#20252d;
      --panel-text:#e5eaf2; --panel-muted:#a6b1c1; --panel-border:#363e4b;
      --panel-control:#282f39; --panel-control-border:#424d5c; --panel-hover:#343e4b;
      --panel-accent:#67d9cd; --panel-active:#203d3e;
      --panel-shadow:0 16px 48px #0009,0 2px 8px #0005;
    `;
    style.textContent = `
      :host { ${lightTheme} }
      @media (prefers-color-scheme:dark) { :host { ${darkTheme} } }
      :host([data-theme="light"]) { ${lightTheme} }
      :host([data-theme="dark"]) { ${darkTheme} }
      * { box-sizing:border-box; }
      section { position:fixed; pointer-events:auto; color-scheme:var(--panel-scheme); background:var(--panel-surface); color:var(--panel-text); border:1px solid var(--panel-border); border-radius:10px; box-shadow:var(--panel-shadow); display:flex; flex-direction:column; overflow:hidden; font:13px system-ui,sans-serif; }
      header { display:flex; align-items:center; gap:8px; padding:7px 9px; background:var(--panel-chrome); border-bottom:1px solid var(--panel-border); min-height:42px; cursor:move; touch-action:none; }
      header span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
      button,select { font:12px system-ui,sans-serif; color-scheme:var(--panel-scheme); color:var(--panel-text); background:var(--panel-control); border:1px solid var(--panel-control-border); border-radius:6px; min-height:28px; padding:4px 8px; cursor:pointer; }
      button { min-width:28px; }
      button:hover,select:hover { background:var(--panel-hover); border-color:var(--panel-muted); }
      button:active { background:var(--panel-active); }
      button:focus-visible,select:focus-visible,header:focus-visible { outline:2px solid var(--panel-accent); outline-offset:-2px; }
      iframe { flex:1; min-height:0; width:100%; border:0; background:var(--panel-surface); }
      .panel-content { position:relative; display:flex; flex:1; min-height:0; }
      .login-help { position:absolute; inset:0; overflow:auto; padding:12px; background:var(--panel-surface); color:var(--panel-text); line-height:1.5; }
      .login-help[hidden] { display:none; }
      .login-help-heading { display:flex; align-items:center; gap:8px; }
      .login-help h2 { flex:1; margin:0; font-size:14px; }
      .login-help p { margin:10px 0; }
      .login-help-context { overflow-wrap:anywhere; color:var(--panel-muted); }
      .login-help ol { padding-left:20px; margin:10px 0; }
      .login-help li { margin:8px 0; }
      .login-help a { color:var(--panel-accent); }
      .login-help a:focus-visible { outline:2px solid var(--panel-accent); outline-offset:2px; }
      .login-help-button { flex:1; min-width:0; padding:0; border:0; border-radius:0; background:transparent; color:var(--panel-muted); font-size:11px; text-align:left; }
      .login-help-button:hover,.login-help-button:active { background:transparent; color:var(--panel-text); text-decoration:underline; }
      footer { flex-shrink:0; display:flex; align-items:center; gap:6px; padding:5px 9px; background:var(--panel-chrome); border-top:1px solid var(--panel-border); color:var(--panel-muted); font-size:11px; min-height:38px; }
      footer span { flex:1; } .resize { touch-action:none; cursor:nwse-resize; color:var(--panel-muted); padding:3px; }
      .edge { position:fixed; inset:0; pointer-events:none; color-scheme:var(--panel-scheme); }
      .edge button { position:fixed; touch-action:none; cursor:grab; pointer-events:auto; max-width:160px; overflow:hidden; white-space:nowrap; box-shadow:0 2px 8px #0003; background:var(--panel-chrome); border-color:var(--panel-border); padding:5px 9px; }
      .edge button span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .edge button:hover { background:var(--panel-hover); border-color:var(--panel-muted); }
      .edge button[aria-expanded="true"] { background:var(--panel-active); border-color:var(--panel-accent); color:var(--panel-accent); }
      .left button, .right button { width:30px; max-width:none; padding:0; }
      .left button span, .right button span { position:absolute; top:50%; left:50%; width:max-content; max-width:142px; transform:translate(-50%, -50%) rotate(90deg); }
      .left button { left:4px; } .right button { right:4px; }
      .top button { top:4px; } .bottom button { bottom:4px; }
    `;
    shadow.append(style);
    for (const edge of ["left", "right", "top", "bottom"]) {
      const container = document.createElement("div");
      container.className = `edge ${edge}`;
      container.dataset.edge = edge;
      shadow.append(container);
    }
    document.documentElement.append(host);
    try {
      host.showPopover();
    } catch {
      host.removeAttribute("popover");
    }
  }
  function save(view: View) {
    const {
      x,
      y,
      width,
      height,
      dock,
      dockPosition,
      anchorX,
      anchorY,
      dockAnchor,
    } = view.panel;
    void browser.runtime
      .sendMessage({
        type: "ARCABLE_PANELS_PATCH",
        token,
        panelId: view.panel.id,
        patch: {
          x,
          y,
          width,
          height,
          dock: dock || null,
          dockPosition: dockPosition ?? null,
          anchorX: anchorX ?? null,
          anchorY: anchorY ?? null,
          dockAnchor: dockAnchor ?? null,
        },
      })
      .catch(() => {});
  }
  function panelSource(panel: FloatingPanel) {
    // A query change forces a new document on reload or a saved URL change;
    // assigning only the same fragment would retain the old remote page.
    return (
      browser.runtime.getURL("panel/index.html") +
      `?load=${++documentVersion}#` +
      new URLSearchParams({ panel: panel.id, token: token || "" })
    );
  }
  function create(panel: FloatingPanel): View {
    const element = document.createElement("section");
    element.setAttribute("aria-label", panel.title || "Floating panel");
    const header = document.createElement("header");
    header.tabIndex = 0;
    header.title = "Drag to move; arrow keys move, Shift + arrow keys resize";
    const title = document.createElement("span");
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Dock panel");
    for (const [value, label] of [
      ["", "Float"],
      ["left", "Dock left"],
      ["right", "Dock right"],
      ["top", "Dock top"],
      ["bottom", "Dock bottom"],
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    const reload = document.createElement("button");
    reload.type = "button";
    reload.textContent = "↻";
    reload.title = "Reload panel";
    reload.setAttribute("aria-label", "Reload panel");
    reload.onclick = () => {
      frame.src = panelSource(view.panel);
    };
    const hide = document.createElement("button");
    hide.textContent = "−";
    hide.title = "Dock to right edge";
    hide.setAttribute("aria-label", "Dock to right edge");
    header.append(title, select, reload, hide);
    const frame = document.createElement("iframe");
    frame.title = panel.title || "Floating panel";
    frame.src = panelSource(panel);
    const footer = document.createElement("footer");
    const content = document.createElement("div");
    content.className = "panel-content";
    const help = createLoginHelp(element, frame, () => view.panel.url);
    content.append(frame, help.element);
    const open = document.createElement("button");
    open.textContent = "Open in tab";
    open.onclick = () => {
      window.open(view.panel.url, "_blank", "noopener,noreferrer");
    };
    const resize = document.createElement("button");
    resize.textContent = "◢";
    resize.className = "resize";
    resize.setAttribute("aria-label", "Resize panel");
    footer.append(help.button, open, resize);
    element.append(header, content, footer);
    const chip = document.createElement("button");
    chip.setAttribute("aria-expanded", "false");
    const chipLabel = document.createElement("span");
    chip.append(chipLabel);
    const view: View = {
      panel,
      element,
      chip,
      frame,
      title,
      select,
      pinned: false,
      hovering: false,
      visible: !panel.dock,
      show(visible) {
        this.visible = visible;
        element.style.visibility = visible ? "visible" : "hidden";
        element.style.pointerEvents = visible ? "auto" : "none";
        chip.setAttribute("aria-expanded", String(visible));
        if (visible) element.style.zIndex = String(++layer);
      },
      layout() {
        const p = positionPanel(this.panel, innerWidth, innerHeight);
        let { x, y } = p;
        const edge = this.panel.dock;
        chip.hidden = !edge;
        title.textContent = chipLabel.textContent =
          this.panel.title || new URL(this.panel.url).hostname;
        if (edge) {
          const container = shadow.querySelector(`[data-edge="${edge}"]`)!;
          if (chip.parentNode !== container) container.append(chip);
          const vertical = edge === "left" || edge === "right";
          chip.style.height = vertical
            ? `${Math.min(chipLabel.scrollWidth, 142) + 18}px`
            : "";
          const measure = chip.getBoundingClientRect();
          const occupied = [...views.values()]
            .filter(
              (other) =>
                other !== this &&
                other.panel.dock === edge &&
                !other.chip.hidden,
            )
            .map((other) => {
              const r = other.chip.getBoundingClientRect();
              return {
                start: vertical ? r.top : r.left,
                end: vertical ? r.bottom : r.right,
              };
            });
          const position = nearestDockPosition(
            anchoredPosition(
              this.panel.dockAnchor,
              this.panel.dockPosition ?? (vertical ? p.y : p.x),
              vertical ? measure.height : measure.width,
              vertical ? innerHeight : innerWidth,
            ),
            vertical ? measure.height : measure.width,
            vertical ? innerHeight : innerWidth,
            occupied,
          );
          // If the edge is full, retain the desired position and retry on the next layout.
          chip.hidden = position === undefined;
          if (position !== undefined) {
            if (!this.panel.dockAnchor)
              this.panel = {
                ...this.panel,
                dockPosition: position,
                dockAnchor: nearestPanelAnchor(
                  position,
                  vertical ? measure.height : measure.width,
                  vertical ? innerHeight : innerWidth,
                ),
              };
            chip.style.top = vertical ? `${position}px` : "";
            chip.style.left = vertical ? "" : `${position}px`;
          }
          const rect = chip.getBoundingClientRect();
          if (edge === "left") {
            x = rect.right + 4;
            y = rect.top;
          }
          if (edge === "right") {
            x = rect.left - p.width - 4;
            y = rect.top;
          }
          if (edge === "top") {
            y = rect.bottom + 4;
            x = rect.left;
          }
          if (edge === "bottom") {
            y = rect.top - p.height - 4;
            x = rect.left;
          }
          const clamped = clampPanel({ ...p, x, y }, innerWidth, innerHeight);
          x = clamped.x;
          y = clamped.y;
        }
        Object.assign(element.style, {
          left: `${x}px`,
          top: `${y}px`,
          width: `${p.width}px`,
          height: `${p.height}px`,
        });
        select.value = edge || "";
        frame.title = element.ariaLabel = this.panel.title || "Floating panel";
        this.show(edge ? this.visible : true);
      },
    };
    const cancel = () => {
      clearTimeout(view.timer);
    };
    const enter = () => {
      cancel();
      view.hovering = true;
      view.show(true);
      view.layout();
    };
    const scheduleHide = () => {
      cancel();
      view.timer = setTimeout(() => {
        if (
          view.panel.dock &&
          !view.pinned &&
          !view.hovering &&
          !(
            keyboardInteraction &&
            (element.matches(":focus-within") || chip.matches(":focus"))
          )
        )
          view.show(false);
      }, 200);
    };
    for (const target of [chip, element]) {
      target.addEventListener("pointerenter", enter);
      target.addEventListener("pointerleave", () => {
        view.hovering = false;
        scheduleHide();
      });
      target.addEventListener("focusin", () => {
        cancel();
        view.show(true);
        view.layout();
      });
      target.addEventListener("focusout", scheduleHide);
    }
    let suppressClick = false;
    chip.onclick = (event) => {
      if (suppressClick && event.detail !== 0) {
        suppressClick = false;
        return;
      }
      suppressClick = false;
      view.pinned = !view.pinned;
      view.show(view.pinned);
      view.layout();
    };
    chip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !view.panel.dock) return;
      const edge = view.panel.dock;
      const vertical = edge === "left" || edge === "right";
      const rect = chip.getBoundingClientRect();
      const origin = vertical ? event.clientY : event.clientX;
      const start = vertical ? rect.top : rect.left;
      const previous = view.panel;
      let dragged = false;
      suppressClick = false;
      chip.setPointerCapture(event.pointerId);
      const move = (e: PointerEvent) => {
        const delta = (vertical ? e.clientY : e.clientX) - origin;
        if (!dragged && Math.abs(delta) < 4) return;
        dragged = true;
        cancel();
        view.panel = {
          ...view.panel,
          dockPosition: start + delta,
          dockAnchor: undefined,
        };
        view.layout();
      };
      const end = (e: PointerEvent) => {
        chip.removeEventListener("pointermove", move);
        chip.removeEventListener("pointerup", end);
        chip.removeEventListener("pointercancel", end);
        if (!dragged) return;
        suppressClick = e.type !== "pointercancel";
        const r = chip.getBoundingClientRect();
        view.panel =
          e.type === "pointercancel"
            ? previous
            : {
                ...view.panel,
                dockPosition: vertical ? r.top : r.left,
                dockAnchor: nearestPanelAnchor(
                  vertical ? r.top : r.left,
                  vertical ? r.height : r.width,
                  vertical ? innerHeight : innerWidth,
                ),
              };
        view.layout();
        if (e.type !== "pointercancel") save(view);
      };
      chip.addEventListener("pointermove", move);
      chip.addEventListener("pointerup", end);
      chip.addEventListener("pointercancel", end);
    });
    element.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && view.panel.dock) {
        view.pinned = false;
        chip.focus();
        view.show(false);
      }
    });
    const dock = (edge?: FloatingPanel["dock"]) => {
      const rect = element.getBoundingClientRect();
      view.panel = {
        ...view.panel,
        dock: edge,
        dockAnchor: undefined,
        dockPosition: edge
          ? edge === "left" || edge === "right"
            ? rect.top
            : rect.left
          : undefined,
      };
      if (!edge) {
        const anchored = anchorPanel(
          {
            ...view.panel,
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          },
          innerWidth,
          innerHeight,
        );
        view.panel = {
          ...view.panel,
          x: rect.left,
          y: rect.top,
          anchorX: anchored.anchorX,
          anchorY: anchored.anchorY,
        };
      }
      view.pinned = false;
      view.visible = !edge;
      view.layout();
      if (edge && !chip.hidden) {
        const chipRect = chip.getBoundingClientRect();
        const vertical = edge === "left" || edge === "right";
        view.panel = {
          ...view.panel,
          dockPosition: vertical ? chipRect.top : chipRect.left,
          dockAnchor: nearestPanelAnchor(
            vertical ? chipRect.top : chipRect.left,
            vertical ? chipRect.height : chipRect.width,
            vertical ? innerHeight : innerWidth,
          ),
        };
      }
      save(view);
    };
    select.onchange = () =>
      dock((select.value || undefined) as FloatingPanel["dock"]);
    hide.onclick = () => dock("right");
    function gesture(event: PointerEvent, sizing: boolean) {
      if (
        event.button !== 0 ||
        (!sizing && (event.target as HTMLElement).closest("button,select"))
      )
        return;
      event.preventDefault();
      cancel();
      view.pinned = true;
      const startX = event.clientX,
        startY = event.clientY;
      const rect = element.getBoundingClientRect();
      const previous = view.panel;
      const start = {
        ...view.panel,
        x: rect.left,
        y: rect.top,
        width: sizing ? rect.width : view.panel.width,
        height: sizing ? rect.height : view.panel.height,
        dock: undefined,
        dockPosition: undefined,
        dockAnchor: undefined,
        anchorX: undefined,
        anchorY: undefined,
      };
      const target = event.currentTarget as HTMLElement;
      target.setPointerCapture(event.pointerId);
      frame.style.pointerEvents = "none";
      const move = (e: PointerEvent) => {
        view.panel = clampPanel(
          {
            ...start,
            x: sizing ? start.x : start.x + e.clientX - startX,
            y: sizing ? start.y : start.y + e.clientY - startY,
            width: sizing
              ? Math.max(240, start.width + e.clientX - startX)
              : start.width,
            height: sizing
              ? Math.max(160, start.height + e.clientY - startY)
              : start.height,
          },
          innerWidth,
          innerHeight,
        );
        if (!sizing)
          view.panel = {
            ...view.panel,
            width: start.width,
            height: start.height,
          };
        view.visible = true;
        view.layout();
      };
      const end = (e: PointerEvent) => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", end);
        target.removeEventListener("pointercancel", end);
        frame.style.pointerEvents = "";
        view.pinned = false;
        if (!sizing && e.type !== "pointercancel") {
          const r = element.getBoundingClientRect();
          const edge =
            r.left <= 24
              ? "left"
              : innerWidth - r.right <= 24
                ? "right"
                : r.top <= 24
                  ? "top"
                  : innerHeight - r.bottom <= 24
                    ? "bottom"
                    : undefined;
          view.panel = {
            ...view.panel,
            dock: edge,
            dockPosition: undefined,
            dockAnchor: undefined,
          };
          view.visible = !edge;
        }
        if (e.type === "pointercancel") view.panel = previous;
        else {
          const r = element.getBoundingClientRect();
          const anchored = anchorPanel(
            {
              ...view.panel,
              x: r.left,
              y: r.top,
              width: r.width,
              height: r.height,
            },
            innerWidth,
            innerHeight,
          );
          view.panel = {
            ...view.panel,
            anchorX: anchored.anchorX,
            anchorY: anchored.anchorY,
          };
        }
        view.layout();
        if (e.type !== "pointercancel") save(view);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", end);
      target.addEventListener("pointercancel", end);
    }
    header.onpointerdown = (e) => gesture(e, false);
    resize.onpointerdown = (e) => gesture(e, true);
    const keyboard = (event: KeyboardEvent, sizing: boolean) => {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      const dx =
        event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : 0;
      const dy =
        event.key === "ArrowUp" ? -16 : event.key === "ArrowDown" ? 16 : 0;
      const rect = element.getBoundingClientRect();
      const p = {
        ...view.panel,
        x: rect.left,
        y: rect.top,
        width: sizing ? rect.width : view.panel.width,
        height: sizing ? rect.height : view.panel.height,
      };
      view.panel = clampPanel(
        {
          ...p,
          dock: undefined,
          dockPosition: undefined,
          dockAnchor: undefined,
          anchorX: undefined,
          anchorY: undefined,
          x: sizing ? p.x : p.x + dx,
          y: sizing ? p.y : p.y + dy,
          width: sizing ? Math.max(240, p.width + dx) : p.width,
          height: sizing ? Math.max(160, p.height + dy) : p.height,
        },
        innerWidth,
        innerHeight,
      );
      const fitted = clampPanel(view.panel, innerWidth, innerHeight);
      const anchored = anchorPanel(fitted, innerWidth, innerHeight);
      view.panel = {
        ...view.panel,
        width: sizing ? view.panel.width : p.width,
        height: sizing ? view.panel.height : p.height,
        anchorX: anchored.anchorX,
        anchorY: anchored.anchorY,
      };
      view.layout();
      save(view);
    };
    header.onkeydown = (e) => {
      if (e.target === header) keyboard(e, e.shiftKey);
    };
    resize.onkeydown = (e) => keyboard(e, true);
    shadow.append(element);
    view.layout();
    return view;
  }
  function render(state: { panels?: FloatingPanel[]; token?: string }) {
    if (state.token !== token) {
      for (const view of views.values()) {
        clearTimeout(view.timer);
        view.element.remove();
        view.chip.remove();
      }
      views.clear();
    }
    token = state.token;
    const panels = state.panels || [];
    if (panels.length) setup();
    for (const [id, view] of views)
      if (!panels.some((p) => p.id === id)) {
        clearTimeout(view.timer);
        view.element.remove();
        view.chip.remove();
        views.delete(id);
      }
    const migratingDock = new Set(
      panels.filter((p) => p.dock && !p.dockAnchor).map((p) => p.id),
    );
    for (const panel of panels) {
      const view = views.get(panel.id);
      if (!view) views.set(panel.id, create(panel));
      else {
        if (view.panel.url !== panel.url) view.frame.src = panelSource(panel);
        if (view.panel.dock !== panel.dock) {
          view.visible = !panel.dock;
          view.pinned = false;
        }
        view.panel = panel;
        view.layout();
      }
    }
    layoutAll();
    for (const view of views.values()) {
      if (!view.panel.anchorX || !view.panel.anchorY) {
        const fitted = positionPanel(view.panel, innerWidth, innerHeight);
        const anchored = anchorPanel(fitted, innerWidth, innerHeight);
        view.panel = {
          ...view.panel,
          anchorX: view.panel.anchorX ?? anchored.anchorX,
          anchorY: view.panel.anchorY ?? anchored.anchorY,
        };
        save(view);
      } else if (migratingDock.has(view.panel.id) && view.panel.dockAnchor)
        save(view);
    }
  }
  browser.runtime.onMessage.addListener((message: any) => {
    if (message?.type === "ARCABLE_PANELS_STATE") render(message);
    return undefined;
  });
  void browser.runtime
    .sendMessage({ type: "ARCABLE_PANELS_GET" })
    .then((state) =>
      render(state as { panels?: FloatingPanel[]; token?: string }),
    )
    .catch(() => {});
  function layoutAll() {
    // Resolve collisions in stable order against this viewport, not stale chip positions.
    for (const view of views.values()) view.chip.hidden = true;
    for (const view of views.values()) view.layout();
  }
  window.addEventListener("resize", layoutAll);
}
