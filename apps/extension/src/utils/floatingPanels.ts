import browser from "webextension-polyfill";
import { getStoredPendingOperations } from "../../../../packages/shared/src/utils/syncEngine";
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

/** Publish saved panel edits locally, independently of the remote sync debounce. */
export function listenForFloatingPanelEdits(): () => void {
  const publish = () => {
    const operation = getStoredPendingOperations().at(-1);
    if (
      operation?.type !== "TAB_UPDATE" ||
      !operation.payload ||
      (!("note" in operation.payload) && !("urlVariants" in operation.payload))
    )
      return;
    void browser.runtime
      .sendMessage({
        type: "ARCABLE_PANELS_LOCAL_EDIT",
        operation,
      })
      .catch((error) =>
        console.warn("Could not update floating panels locally:", error),
      );
  };
  window.addEventListener("arcable_pending_op_saved", publish);
  return () => window.removeEventListener("arcable_pending_op_saved", publish);
}
