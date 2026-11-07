import browser from "webextension-polyfill";
export async function bindFloatingPanels(
  browserTabId: number,
  itemId?: string,
  url?: string,
  variantId?: string,
  preserveSelection = false,
) {
  await browser.runtime.sendMessage({
    type: "ARCABLE_PANELS_BIND",
    browserTabId,
    itemId,
    url,
    variantId,
    preserveSelection,
  });
}
