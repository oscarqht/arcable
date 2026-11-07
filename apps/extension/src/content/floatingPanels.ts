import browser from "webextension-polyfill";
import {
  clampPanel,
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
      footer { display:flex; align-items:center; gap:6px; padding:5px 9px; background:var(--panel-chrome); border-top:1px solid var(--panel-border); color:var(--panel-muted); font-size:11px; min-height:38px; }
      footer span { flex:1; } .resize { touch-action:none; cursor:nwse-resize; color:var(--panel-muted); padding:3px; }
      .edge { position:fixed; display:flex; gap:5px; padding:4px; max-width:100vw; max-height:100vh; overflow:auto; pointer-events:none; color-scheme:var(--panel-scheme); }
      .edge button { pointer-events:auto; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; box-shadow:0 2px 8px #0003; background:var(--panel-chrome); border-color:var(--panel-border); padding:5px 9px; }
      .edge button:hover { background:var(--panel-hover); border-color:var(--panel-muted); }
      .edge button[aria-expanded="true"] { background:var(--panel-active); border-color:var(--panel-accent); color:var(--panel-accent); }
      .left { left:0;top:40px;flex-direction:column; } .right { right:0;top:40px;flex-direction:column; }
      .top { top:0;left:40px; } .bottom { bottom:0;left:40px; }
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
    const { x, y, width, height, dock } = view.panel;
    void browser.runtime
      .sendMessage({
        type: "ARCABLE_PANELS_PATCH",
        token,
        panelId: view.panel.id,
        patch: { x, y, width, height, dock: dock || null },
      })
      .catch(() => {});
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
    const hide = document.createElement("button");
    hide.textContent = "−";
    hide.title = "Dock to right edge";
    hide.setAttribute("aria-label", "Dock to right edge");
    header.append(title, select, hide);
    const frame = document.createElement("iframe");
    frame.title = panel.title || "Floating panel";
    frame.src = panel.url;
    frame.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-popups allow-downloads",
    );
    const footer = document.createElement("footer");
    const hint = document.createElement("span");
    hint.textContent = "Blank or blocked?";
    const open = document.createElement("button");
    open.textContent = "Open in tab";
    open.onclick = () => {
      window.open(view.panel.url, "_blank", "noopener,noreferrer");
    };
    const resize = document.createElement("button");
    resize.textContent = "◢";
    resize.className = "resize";
    resize.setAttribute("aria-label", "Resize panel");
    footer.append(hint, open, resize);
    element.append(header, frame, footer);
    const chip = document.createElement("button");
    chip.setAttribute("aria-expanded", "false");
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
        const p = clampPanel(this.panel, innerWidth, innerHeight);
        let { x, y } = p;
        const edge = this.panel.dock;
        chip.hidden = !edge;
        if (edge) {
          const container = shadow.querySelector(`[data-edge="${edge}"]`)!;
          if (chip.parentNode !== container) container.append(chip);
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
        title.textContent = chip.textContent =
          this.panel.title || new URL(this.panel.url).hostname;
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
    chip.onclick = () => {
      view.pinned = !view.pinned;
      view.show(view.pinned);
      view.layout();
    };
    element.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && view.panel.dock) {
        view.pinned = false;
        chip.focus();
        view.show(false);
      }
    });
    const dock = (edge?: FloatingPanel["dock"]) => {
      view.panel = { ...view.panel, dock: edge };
      view.pinned = false;
      view.visible = !edge;
      view.layout();
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
      const start = {
        ...view.panel,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        dock: undefined,
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
          view.panel = { ...view.panel, dock: edge };
          view.visible = !edge;
        }
        view.layout();
        save(view);
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
      const p = view.panel;
      view.panel = clampPanel(
        {
          ...p,
          dock: undefined,
          x: sizing ? p.x : p.x + dx,
          y: sizing ? p.y : p.y + dy,
          width: sizing ? Math.max(240, p.width + dx) : p.width,
          height: sizing ? Math.max(160, p.height + dy) : p.height,
        },
        innerWidth,
        innerHeight,
      );
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
    for (const panel of panels) {
      const view = views.get(panel.id);
      if (!view) views.set(panel.id, create(panel));
      else {
        if (view.panel.url !== panel.url) view.frame.src = panel.url;
        if (view.panel.dock !== panel.dock) {
          view.visible = !panel.dock;
          view.pinned = false;
        }
        view.panel = panel;
        view.layout();
      }
    }
    // Lay out after all chips have their final positions.
    for (const view of views.values()) view.layout();
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
  window.addEventListener("resize", () => {
    for (const view of views.values()) view.layout();
  });
}
