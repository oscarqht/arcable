// FIREFOX_BIN=/path/to/firefox node apps/extension/tests/floatingPanels.firefox.test.mjs
// Uses the built Firefox add-on in a temporary copy; the test driver is an
// extension page, so no user profile, credentials or browser settings are used.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const firefox = process.env.FIREFOX_BIN;
if (!firefox) throw new Error("Set FIREFOX_BIN to a Firefox executable.");
let finish;
const result = new Promise((resolve) => {
  finish = resolve;
});
const server = http.createServer((req, res) => {
  if (req.url === "/screenshot") {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      fs.writeFileSync(
        "/tmp/arcable-firefox-embedding.png",
        Buffer.from(data.split(",")[1], "base64"),
      );
      res.end("ok");
    });
    return;
  }
  if (req.url === "/result") {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      finish(JSON.parse(data));
      res.end("ok");
    });
    return;
  }
  res.setHeader("Content-Type", "text/html");
  if (req.url === "/redirect") {
    res.writeHead(302, { Location: "/blocked", "X-Frame-Options": "DENY" });
    return res.end();
  }
  if (req.url === "/host") {
    res.setHeader("Content-Security-Policy", "frame-src 'none'");
    return res.end('<h1>Host page</h1><iframe src="/blocked"></iframe>');
  }
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'none'; script-src 'none'",
  );
  res.end(
    `<h1>${req.url === "/next" ? "Next page loaded" : "Blocked page loaded"}</h1><a href="${req.url === "/next" ? "/blocked" : "/next"}">Navigate</a><iframe src="/nested"></iframe><script>document.body.dataset.unexpectedScript='ran'</script>`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const copy = fs.mkdtempSync(
  path.join(os.tmpdir(), "arcable-firefox-embedding-"),
);
fs.cpSync(fileURLToPath(new URL("../dist/firefox", import.meta.url)), copy, {
  recursive: true,
});
const manifest = JSON.parse(
  fs.readFileSync(path.join(copy, "manifest.json"), "utf8"),
);
manifest.background.scripts.push("embedding-bootstrap.js");
manifest.content_scripts.push({
  matches: ["http://127.0.0.1/*"],
  js: ["embedding-observer.js"],
  all_frames: true,
  run_at: "document_end",
});
fs.writeFileSync(path.join(copy, "manifest.json"), JSON.stringify(manifest));
fs.writeFileSync(
  path.join(copy, "embedding-bootstrap.js"),
  `browser.storage.session.get('arcable_test_started').then(async s=>{if(s.arcable_test_started)return;await browser.storage.session.set({arcable_test_started:true});setTimeout(()=>browser.tabs.create({url:browser.runtime.getURL('embedding-test.html')+'?fixture='+encodeURIComponent(${JSON.stringify(base)})}),500)})`,
);
fs.writeFileSync(
  path.join(copy, "embedding-observer.js"),
  `browser.runtime.sendMessage({type:'ARCABLE_EMBED_TEST_DOCUMENT',url:location.href,text:document.body.innerText,script:document.body.dataset.unexpectedScript});browser.runtime.onMessage.addListener(m=>{if(m?.type==='ARCABLE_EMBED_TEST_NAVIGATE')document.querySelector('a')?.click()});`,
);
fs.writeFileSync(
  path.join(copy, "embedding-test.html"),
  '<!doctype html><script src="embedding-test.js"></script>',
);
fs.copyFileSync(
  new URL("./floatingPanels.firefox.driver.js", import.meta.url),
  path.join(copy, "embedding-test.js"),
);
const webExt = execFileSync(
  "pnpm",
  ["--package=web-ext", "dlx", "which", "web-ext"],
  { encoding: "utf8" },
)
  .split("\n")[0]
  .trim();
const proc = spawn(
  webExt,
  [
    "run",
    "--source-dir",
    copy,
    "--firefox",
    firefox,
    "--args=-headless",
    "--no-reload",
    "--no-input",
  ],
  { detached: true, stdio: ["ignore", "pipe", "pipe"] },
);
let output = "";
proc.stdout.on("data", (chunk) => {
  output += chunk;
});
proc.stderr.on("data", (chunk) => {
  output += chunk;
});
let timer;
try {
  const outcome = await Promise.race([
    result,
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error("Firefox integration timed out. " + output.slice(-2000)),
          ),
        60000,
      );
    }),
    new Promise((_, reject) =>
      proc.once("exit", (code) =>
        reject(
          new Error("web-ext exited " + code + ": " + output.slice(-2000)),
        ),
      ),
    ),
  ]);
  assert.ok(outcome.success, JSON.stringify(outcome));
  console.log(
    "Firefox installed-extension checks passed:",
    outcome.checks.join(", "),
  );
} finally {
  clearTimeout(timer);
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {}
  await new Promise((resolve) =>
    proc.exitCode !== null || proc.signalCode !== null
      ? resolve()
      : proc.once("exit", resolve),
  );
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(copy, { recursive: true, force: true });
}
