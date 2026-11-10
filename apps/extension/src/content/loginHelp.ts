import { isBrave, isFirefox, isSafari } from "../utils/browser";

type Guide = "brave" | "chrome" | "firefox" | "safari" | "other";
const guides: Record<Guide, { name: string; steps: string[]; url: string }> = {
  brave: {
    name: "Brave",
    steps: [
      "On the page hosting this panel, click the lion (Shields) icon beside the address bar.",
      "Expand the Shields controls and set the cookie control to Allow all cookies for this site.",
      "Reload the hosting page, then open the panel again. Your existing website login can now be available here.",
    ],
    url: "https://support.brave.app/hc/en-us/articles/360022806212-How-do-I-use-Shields-while-browsing",
  },
  chrome: {
    name: "Chrome",
    steps: [
      "On the page hosting this panel, look for the third-party cookie control in the address bar and allow third-party cookies for this site.",
      "If that control is not shown, open Chrome Settings, search for Third-party cookies, and add the hosting site under Sites allowed to use third-party cookies.",
      "Reload the hosting page, then open the panel again.",
    ],
    url: "https://support.google.com/chrome/answer/95647",
  },
  firefox: {
    name: "Firefox",
    steps: [
      "On a hosting page you trust, click the shield icon to the left of the address bar.",
      "Turn off Enhanced Tracking Protection for this site. This relaxes tracking protection for the hosting site, including cookie isolation.",
      "Firefox reloads the page. Open the panel again and check whether your website login is available.",
    ],
    url: "https://support.mozilla.org/en-US/kb/third-party-cookies-firefox-tracking-protection",
  },
  safari: {
    name: "Safari",
    steps: [
      "Use Open in tab to sign in directly on the panel website in Safari.",
      "Safari's cross-site tracking protection may keep that login unavailable in an embedded panel. The website may also block embedding.",
      "If the panel still cannot sign in, continue in the separate tab. Arcable does not change Safari's privacy settings.",
    ],
    url: "https://support.apple.com/guide/safari/prevent-cross-site-tracking-sfri40732/mac",
  },
  other: {
    name: "Other browser",
    steps: [
      "Open the cookie or privacy controls for the page hosting this panel.",
      "Allow third-party cookies or add a site-specific exception for the hosting site.",
      "Reload the hosting page, then open the panel again.",
    ],
    url: "https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies",
  },
};
let nextId = 0;

export function createLoginHelp(
  container: HTMLElement,
  frame: HTMLIFrameElement,
  panelUrl: () => string,
) {
  const id = `arcable-login-help-${++nextId}`;
  const button = document.createElement("button");
  button.className = "login-help-button";
  button.textContent = "Login not working?";
  button.setAttribute("aria-label", "Login not working?");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", id);

  const element = document.createElement("div");
  element.id = id;
  element.className = "login-help";
  element.hidden = true;
  element.setAttribute("role", "region");
  element.setAttribute("aria-labelledby", `${id}-title`);
  const row = document.createElement("div");
  row.className = "login-help-heading";
  const heading = document.createElement("h2");
  heading.id = `${id}-title`;
  heading.textContent = "Login and cookies";
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Close login help");
  row.append(heading, close);
  const intro = document.createElement("p");
  intro.textContent =
    "Signed in in a tab, but not here? Your browser may be blocking the sign-in cookie in this embedded page.";
  const context = document.createElement("p");
  context.className = "login-help-context";
  const label = document.createElement("label");
  label.textContent = "Browser ";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Login help browser");
  for (const [value, guide] of Object.entries(guides)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = guide.name;
    select.append(option);
  }
  select.value = isSafari() ? "safari" : isBrave()
    ? "brave"
    : isFirefox()
      ? "firefox"
      : /Chrome|Chromium/i.test(navigator.userAgent)
        ? "chrome"
        : "other";
  label.append(select);
  const steps = document.createElement("ol");
  const link = document.createElement("a");
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const fallback = document.createElement("p");
  fallback.textContent =
    "Also check that the website tab and this panel use the same browser profile, private-window mode, and Firefox container. If sign-in still fails, use Open in tab.";
  element.append(row, intro, context, label, steps, link, fallback);

  const render = () => {
    context.textContent = `Hosting page: ${location.host || "this page"}. Panel website: ${new URL(panelUrl()).hostname}. ${select.value === "safari" ? "Use Open in tab if this website cannot sign in inside a panel." : "Apply the exception to the hosting page in the address bar."}`;
    const guide = guides[select.value as Guide];
    steps.replaceChildren(
      ...guide.steps.map((text) => {
        const step = document.createElement("li");
        step.textContent = text;
        return step;
      }),
    );
    link.href = guide.url;
    link.textContent = `${guide.name} cookie help`;
  };
  const hide = () => {
    element.hidden = true;
    frame.inert = false;
    frame.style.visibility = "";
    frame.removeAttribute("aria-hidden");
    button.setAttribute("aria-expanded", "false");
    button.focus();
  };
  select.onchange = render;
  button.onclick = () => {
    if (!element.hidden) return hide();
    render();
    element.hidden = false;
    frame.inert = true;
    frame.style.visibility = "hidden";
    frame.setAttribute("aria-hidden", "true");
    button.setAttribute("aria-expanded", "true");
    select.focus();
  };
  close.onclick = hide;
  container.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || element.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      hide();
    },
    true,
  );
  return { button, element };
}
