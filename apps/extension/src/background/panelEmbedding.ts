import browser from "webextension-polyfill";

export const panelPage = "panel/index.html";
const ruleId = 817001;
const frameKey = "arcable_panel_wrapper_frames";
const session = browser.storage.session || browser.storage.local;
type PanelFrames = Record<string, { ids: number[]; registeredAt: number }>;
let ready: Promise<void> | undefined;

// Declarative rules cannot edit an individual CSP directive. Header removal is
// limited to subframe requests initiated by our extension, in bound panel tabs.
export async function preparePanelEmbedding(tabId: number, frameId: number) {
  const dnr = browser.declarativeNetRequest;
  const previous = ready || Promise.resolve();
  ready = previous
    .catch(() => {})
    .then(async () => {
      const rules = await dnr.getSessionRules();
      const tabs =
        rules.find((rule) => rule.id === ruleId)?.condition.tabIds || [];
      const frames = ((await session.get(frameKey))[frameKey] ||
        {}) as PanelFrames;
      frames[tabId] = {
        ids: [...new Set([...(frames[tabId]?.ids || []), frameId])],
        registeredAt: Date.now(),
      };
      await session.set({ [frameKey]: frames });
      if (tabs.includes(tabId)) return;
      await dnr.updateSessionRules({
        removeRuleIds: [ruleId],
        addRules: [
          {
            id: ruleId,
            priority: 1,
            action: {
              type: "modifyHeaders",
              responseHeaders: [
                "x-frame-options",
                "content-security-policy",
              ].map((header) => ({ header, operation: "remove" })),
            },
            condition: {
              tabIds: [...tabs, tabId],
              initiatorDomains: [new URL(browser.runtime.getURL("")).hostname],
              resourceTypes: ["sub_frame"],
              regexFilter: "^https?://",
            },
          },
        ],
      });
    });
  return ready;
}

export async function forgetPanelEmbedding(
  tabId: number,
  navigationStartedAt?: number,
) {
  const previous = ready || Promise.resolve();
  ready = previous
    .catch(() => {})
    .then(async () => {
      const frames = ((await session.get(frameKey))[frameKey] ||
        {}) as PanelFrames;
      // Firefox may deliver a queued navigation event after the new document's
      // wrapper handshake. Do not remove rules registered by that new document.
      if (
        navigationStartedAt !== undefined &&
        frames[tabId]?.registeredAt >= navigationStartedAt
      )
        return;
      delete frames[tabId];
      await session.set({ [frameKey]: frames });
      const rules = await browser.declarativeNetRequest.getSessionRules();
      const rule = rules.find((rule) => rule.id === ruleId);
      if (!rule?.condition.tabIds?.includes(tabId)) return;
      const tabs = rule.condition.tabIds.filter((id) => id !== tabId);
      await browser.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [ruleId],
        addRules: tabs.length
          ? [{ ...rule, condition: { ...rule.condition, tabIds: tabs } }]
          : [],
      });
    });
  return ready;
}

export function initPanelEmbedding() {
  const retry = async (
    tabId: number,
    parentFrameId: number,
    url: string,
    type = "ARCABLE_PANEL_RETRY",
  ) => {
    if (parentFrameId <= 0) return;
    const frames = ((await session.get(frameKey))[frameKey] ||
      {}) as PanelFrames;
    if (!frames[tabId]?.ids.includes(parentFrameId)) return;
    await browser.tabs.sendMessage(
      tabId,
      { type, url },
      { frameId: parentFrameId },
    );
  };
  browser.webRequest.onErrorOccurred.addListener(
    (details) => {
      // Firefox supplies the method and parent on this event. It can arrive
      // before webNavigation and avoids depending on cross-API event ordering.
      if (
        details.method !== "GET" ||
        !/BLOCKED_BY_RESPONSE|CSP|FRAME|XFO/i.test(details.error)
      )
        return;
      void retry(details.tabId, details.parentFrameId, details.url).catch(
        () => {},
      );
    },
    { urls: ["http://*/*", "https://*/*"], types: ["sub_frame"] },
  );

  const parentOf = async (details: {
    tabId: number;
    frameId: number;
    parentFrameId?: number;
  }) =>
    details.parentFrameId ??
    (
      await browser.webNavigation.getFrame({
        tabId: details.tabId,
        frameId: details.frameId,
      })
    )?.parentFrameId;
  browser.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0 || !/^https?:\/\//i.test(details.url)) return;
    void (async () => {
      const parent = await parentOf(details);
      if (parent !== undefined)
        await retry(
          details.tabId,
          parent,
          details.url,
          "ARCABLE_PANEL_COMMITTED",
        );
    })().catch(() => {});
  });
  const methods = new Map<
    string,
    { url: string; method: string; timeStamp: number }
  >();
  const navigations = new Map<string, number>();
  const clearTab = (tabId: number) => {
    for (const map of [methods, navigations])
      for (const key of map.keys())
        if (key.startsWith(`${tabId}:`)) map.delete(key);
  };
  browser.tabs.onRemoved.addListener(clearTab);
  browser.webNavigation.onBeforeNavigate.addListener((details) => {
    const key = `${details.tabId}:${details.frameId}`;
    methods.delete(key);
    if (navigations.size >= 512)
      navigations.delete(navigations.keys().next().value!);
    navigations.set(key, details.timeStamp);
  });
  browser.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.type === "main_frame") {
        clearTab(details.tabId);
        void forgetPanelEmbedding(details.tabId, details.timeStamp).catch(
          () => {},
        );
      } else {
        // Only GETs may be retried: replaying a submitted form could duplicate a
        // mutation. Bound memory for pages that continually replace child frames.
        if (methods.size >= 512) methods.delete(methods.keys().next().value!);
        methods.set(`${details.tabId}:${details.frameId}`, {
          url: details.url,
          method: details.method,
          timeStamp: details.timeStamp,
        });
      }
    },
    { urls: ["http://*/*", "https://*/*"], types: ["main_frame", "sub_frame"] },
  );
  browser.webNavigation.onErrorOccurred.addListener((details) => {
    const key = `${details.tabId}:${details.frameId}`;
    const request = methods.get(key);
    const startedAt = navigations.get(key);
    // Firefox reports NS_ERROR_XFO_VIOLATION (0x805a0060) and
    // NS_ERROR_CSP_FRAME_ANCESTOR_VIOLATION (0x805a0062) as numeric codes.
    // Older builds may omit the error string; scope all retries to a wrapper.
    const error = (details as typeof details & { error?: string }).error || "";
    if (
      request?.method !== "GET" ||
      request.url !== details.url ||
      startedAt === undefined ||
      !Number.isFinite(request.timeStamp) ||
      request.timeStamp <= startedAt ||
      (error &&
        !/BLOCKED_BY_RESPONSE|CSP|FRAME|XFO|^Error code (?:2153381984|2153381986)$/i.test(
          error,
        ))
    )
      return;
    void (async () => {
      // A refused frame can already be gone when Firefox handles the event.
      // Prefer the event's parent ID over querying the failed document.
      const parentFrameId = await parentOf(details);
      if (parentFrameId === undefined || parentFrameId <= 0) return;
      await retry(details.tabId, parentFrameId, details.url);
    })().catch(() => {});
  });
}
