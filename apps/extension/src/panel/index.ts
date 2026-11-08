import browser from "webextension-polyfill";

const params = new URLSearchParams(location.hash.slice(1));
const frame = document.createElement("iframe");
frame.title = "Floating panel webpage";
frame.setAttribute(
  "sandbox",
  "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals",
);
const retried = new Set<string>();
browser.runtime.onMessage.addListener((message: any) => {
  if (
    message?.type === "ARCABLE_PANEL_COMMITTED" &&
    typeof message.url === "string"
  ) {
    retried.clear();
    return;
  }
  if (
    message?.type !== "ARCABLE_PANEL_RETRY" ||
    typeof message.url !== "string" ||
    !/^https?:\/\//i.test(message.url) ||
    retried.has(message.url)
  )
    return;
  retried.add(message.url);
  frame.src = message.url;
  return undefined;
});
void browser.runtime
  .sendMessage({
    type: "ARCABLE_PANEL_DOCUMENT",
    panelId: params.get("panel"),
    token: params.get("token"),
  })
  .then((result: any) => {
    if (!result?.url) throw new Error("Panel is no longer available");
    frame.src = result.url;
    document.body.append(frame);
  })
  .catch(() => {
    const hint = document.createElement("p");
    hint.textContent =
      "Unable to load this panel. Reload the tab or use Open in tab.";
    document.body.append(hint);
  });
