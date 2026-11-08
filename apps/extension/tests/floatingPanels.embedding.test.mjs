// Builds must exist. Uses an isolated Chromium profile and the real extension.
// CHROME_BIN=/path/to/brave node apps/extension/tests/floatingPanels.embedding.test.mjs
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const chrome = process.env.CHROME_BIN;
const harnessName = `arcable-${process.pid}`;
if (!chrome)
  throw new Error(
    "Set CHROME_BIN to an extension-capable Chromium executable (e.g. Brave).",
  );
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  if (req.url === "/redirect") {
    res.writeHead(302, { Location: "/blocked", "X-Frame-Options": "DENY" });
    return res.end();
  }
  if (req.url === "/blocked" || req.url === "/next") {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "frame-ancestors 'none'; script-src 'self'",
    );
    return res.end(
      `<h1>${req.url === "/next" ? "Next page loaded" : "Blocked page loaded"}</h1><input id="state"><a href="${req.url === "/next" ? "/blocked" : "/next"}">Navigate</a><iframe src="/nested"></iframe>`,
    );
  }
  if (req.url === "/nested") {
    res.setHeader("X-Frame-Options", "DENY");
    return res.end("<h1>Nested content should remain blocked</h1>");
  }
  if (req.url === "/host")
    res.setHeader("Content-Security-Policy", "frame-src 'none'");
  res.end(
    '<h1>Host page</h1><iframe src="/blocked" title="Ordinary iframe"></iframe>',
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "arcable-embedding-"));
const extension = fileURLToPath(new URL("../dist/chrome", import.meta.url));
const proc = spawn(
  chrome,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-features=BraveShields",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = fs
        .readFileSync(path.join(profile, "DevToolsActivePort"), "utf8")
        .split("\n")[0];
      break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!port) throw new Error("Browser did not start");
  const script = fs.readFileSync(
    new URL("./floatingPanels.embedding.py", import.meta.url),
    "utf8",
  );
  const harness = spawn("browser-harness", [], {
    env: {
      ...process.env,
      BU_NAME: harnessName,
      BU_CDP_URL: `http://127.0.0.1:${port}`,
      BH_TAB_MARKER: "0",
      ARCABLE_FIXTURE: `http://127.0.0.1:${server.address().port}`,
    },
    stdio: ["pipe", "inherit", "inherit"],
  });
  harness.stdin.end(script);
  const exit = await new Promise((resolve) => harness.once("exit", resolve));
  if (exit !== 0) throw new Error(`Browser assertions failed (${exit})`);
} finally {
  try {
    execFileSync("browser-harness", ["--reload"], {
      env: { ...process.env, BU_NAME: harnessName },
      stdio: "ignore",
    });
  } catch {}
  proc.kill();
  await new Promise((resolve) =>
    proc.exitCode !== null || proc.signalCode !== null
      ? resolve()
      : proc.once("exit", resolve),
  );
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(profile, { recursive: true, force: true });
}
