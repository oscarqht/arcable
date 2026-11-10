import assert from "node:assert/strict";
import { require, mockModules, event } from "./testLoader.mjs";
const onClicked = event();
let opened = 0;
let popup;
mockModules({
  "webextension-polyfill": {
    action: { onClicked, setPopup: async value => { popup = value.popup; } },
    runtime: {
      openOptionsPage: async () => {
        opened++;
      },
    },
  },
});
require("../src/background/extensionAction.ts").initExtensionActionBehavior();
onClicked.emit({ id: 1 });
assert.equal(opened, 1);
assert.equal(popup, "");
console.log("PASS toolbar click opens Options");
