const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const { setTimeout: sleep } = require("node:timers/promises");

const path = require("node:path");

const isWindows = process.platform === "win32";
const port = Number(process.env.PORT ?? 3000);
const hubUrl = `http://127.0.0.1:${port}`;
let hubProcess;

function hubBinary() {
  if (process.env.AGENT_HUB_BIN) return process.env.AGENT_HUB_BIN;
  if (isWindows) return path.join(process.resourcesPath, "..", "agent-hub.cmd");
  return "/usr/bin/agent-hub";
}

async function serviceIsReady() {
  try {
    const response = await fetch(hubUrl, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function startService() {
  if (await serviceIsReady()) return;

  hubProcess = spawn(hubBinary(), [], {
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
    shell: isWindows,
    windowsHide: true
  });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await serviceIsReady()) return;
    await sleep(200);
  }

  throw new Error(`Agent Hub did not start at ${hubUrl}.`);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#050507",
    title: "Agent Hub",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(hubUrl)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  void window.loadURL(hubUrl);
  return window;
}

function stopService() {
  if (hubProcess && !hubProcess.killed) hubProcess.kill("SIGTERM");
}

async function checkWindowsUpdate(window) {
  const repository = process.env.AGENT_HUB_UPDATE_REPOSITORY;
  if (!isWindows || !repository) return;
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) return;
    const release = await response.json();
    const tag = typeof release.tag_name === "string" ? release.tag_name : "";
    const current = app.getVersion();
    const latest = tag.replace(/^v/, "");
    if (!latest || latest === current) return;
    const asset = (release.assets ?? []).find((entry) => entry.name === `agent-hub_${latest}_win-x64.zip`);
    if (!asset) return;
    const choice = await dialog.showMessageBox(window, {
      type: "info",
      buttons: ["Download update", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: `Agent Hub ${latest} is available (this app is ${current}).`,
      detail: "Download opens the release asset; checksum in the matching .sha256 file."
    });
    if (choice.response === 0) void shell.openExternal(asset.browser_download_url);
  } catch {
    // Update check is best-effort; never interrupt startup.
  }
}

app.whenReady().then(async () => {
  try {
    await startService();
    const window = createWindow();
    void checkWindowsUpdate(window);
  } catch (error) {
    dialog.showErrorBox("Agent Hub could not start", error instanceof Error ? error.message : String(error));
    app.quit();
  }
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", stopService);
