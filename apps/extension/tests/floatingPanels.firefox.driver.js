const base = new URL(location.href).searchParams.get("fixture");
window.addEventListener("error", (e) =>
  fetch(base + "/result", {
    method: "POST",
    body: JSON.stringify({ success: false, error: e.message }),
  }),
);
async function until(fn, label) {
  let last;
  for (let i = 0; i < 100; i++) {
    try {
      const value = await Promise.race([
        fn(),
        new Promise((r) => setTimeout(() => r(null), 1000)),
      ]);
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Timed out: " + label + " " + last);
}
(async () => {
  const documents = new Map();
  browser.runtime.onMessage.addListener((m, s) => {
    if (m?.type === "ARCABLE_EMBED_TEST_DOCUMENT")
      documents.set(s.frameId, { frameId: s.frameId, result: m });
  });
  let panel = {
    id: "embed",
    title: "Firefox test",
    url: base + "/redirect",
    x: 80,
    y: 80,
    width: 600,
    height: 440,
  };
  panel.patterns = [base + '/host'];
  await browser.storage.local.set({ arcable_side_panel_rules: [panel], arcable_panel_layouts: { embed: { x: 80, y: 80, width: 600, height: 440 } } });
  const tab = await browser.tabs.create({ url: base + "/host", active: false });
  await until(
    async () =>
      (await browser.tabs.get(tab.id)).status === "complete" &&
      (await browser.tabs.get(tab.id)).url === base + "/host",
    "host loaded",
  );
  const inspect = async () => [...documents.values()];
  const loaded = await until(
    async () =>
      (await inspect()).find(
        (r) =>
          r.result?.url === base + "/blocked" &&
          r.result?.text.includes("Blocked page loaded"),
      ),
    "blocked page redirect",
  );

  await fetch(base + "/screenshot", {
    method: "POST",
    body: await browser.tabs.captureTab(tab.id, { format: "png" }),
  });

  void browser.tabs
    .sendMessage(
      tab.id,
      { type: "ARCABLE_EMBED_TEST_NAVIGATE" },
      { frameId: loaded.frameId },
    )
    .catch(() => {});
  await until(
    async () =>
      (await inspect()).find(
        (r) =>
          r.result?.url === base + "/next" &&
          r.result?.text.includes("Next page loaded"),
      ),
    "blocked in-panel navigation",
  );
  for (const [suffix, text] of [
    ["/blocked", "Blocked page loaded"],
    ["/next", "Next page loaded"],
  ]) {
    documents.clear();
    void browser.tabs
      .sendMessage(
        tab.id,
        { type: "ARCABLE_EMBED_TEST_NAVIGATE" },
        { frameId: loaded.frameId },
      )
      .catch(() => {});
    await until(
      async () =>
        [...documents.values()].find(
          (r) =>
            r.result?.url === base + suffix && r.result?.text.includes(text),
        ),
      "repeated blocked-page navigation",
    );
  }
  documents.clear();
  panel = { ...panel, url: base + "/blocked" };
  await browser.storage.local.set({ arcable_side_panel_rules: [panel] });
  await until(
    async () =>
      (await inspect()).find(
        (r) =>
          r.result?.url === base + "/blocked" &&
          r.result?.text.includes("Blocked page loaded"),
      ),
    "saved URL update",
    "reload persistence",
    "rule cleanup",
  );
  const finalDocuments = await inspect();
  if (
    finalDocuments.some(
      (r) =>
        r.result?.url === base + "/nested" &&
        r.result?.text.includes("Blocked page loaded"),
    )
  )
    throw Error("Nested site frame unexpectedly loaded");
  const originals = finalDocuments.filter(
    (r) =>
      r.result?.url === base + "/blocked" &&
      r.result?.text.includes("Blocked page loaded"),
  );
  if (originals.length !== 1)
    throw Error("Ordinary iframe unexpectedly loaded");
  documents.clear();
  await browser.tabs.reload(tab.id);
  await until(
    async () =>
      (await inspect()).find(
        (r) =>
          r.result?.url === base + "/blocked" &&
          r.result?.text.includes("Blocked page loaded"),
      ),
    "panel binding survives reload",
  );
  await browser.tabs.remove(tab.id);
  await until(
    async () =>
      !(await browser.declarativeNetRequest.getSessionRules()).some((r) =>
        r.condition.tabIds?.includes(tab.id),
      ),
    "tab closure removes rules",
  );
  await fetch(base + "/result", {
    method: "POST",
    body: JSON.stringify({
      success: true,
      checks: [
        "redirect",
        "host CSP isolation",
        "XFO/CSP compatibility",
        "in-panel navigation",
        "repeated A-B-A-B navigation",
        "saved URL update",
        "reload persistence",
        "rule cleanup",
        "ordinary and nested frame isolation",
      ],
    }),
  });
})().catch(async (error) =>
  fetch(base + "/result", {
    method: "POST",
    body: JSON.stringify({
      success: false,
      error: String(error),
      stack: error.stack,
    }),
  }),
);
