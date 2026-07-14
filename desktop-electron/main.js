/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, Menu, Notification, dialog, ipcMain, shell, screen, session } = require("electron");
const { execFile, execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const APP_NAME = "Osiris Vault";
const LOCAL_HOST = "127.0.0.1";
const APP_PORT = 3217;
const PG_PORT = 5447;
const LOCAL_ORIGIN = `http://${LOCAL_HOST}:${APP_PORT}`;
const APP_ROOT = app.isPackaged ? path.join(process.resourcesPath, "app") : path.resolve(__dirname, "..");
const CONTROL_FILE = path.join(__dirname, "control.html");
const SERVER_ROOT = app.isPackaged ? path.join(APP_ROOT, "server") : path.join(APP_ROOT, ".next", "standalone");
const SERVER_ENTRY = path.join(SERVER_ROOT, "server.js");
const RUNTIME_SCRIPTS = app.isPackaged ? path.join(APP_ROOT, "runtime", "scripts") : path.join(APP_ROOT, "scripts");
const SCHEMA_PATH = app.isPackaged ? path.join(APP_ROOT, "runtime", "schema.sql") : path.join(APP_ROOT, "scripts", "schema.sql");
const TRANSCRIBE_SCRIPT = app.isPackaged ? path.join(APP_ROOT, "runtime", "transcribe.py") : path.join(APP_ROOT, "scripts", "transcribe.py");
const NATIVE_ROOT = path.join(APP_ROOT, "native");

app.setName(APP_NAME);
app.setPath("userData", path.join(app.getPath("appData"), APP_NAME));

const SUPPORT_DIR = app.getPath("userData");
const LOG_DIR = path.join(app.getPath("logs"));
const DOWNLOAD_DIR = path.join(app.getPath("downloads"), APP_NAME);
const CONFIG_PATH = path.join(SUPPORT_DIR, "runtime.json");
const PID_PATH = path.join(SUPPORT_DIR, "server.pid");
const ELECTRON_LOG = path.join(LOG_DIR, "electron.log");
const SERVER_LOG = path.join(LOG_DIR, "server.log");

let mainWindow = null;
let serverProcess = null;
let postgresStartedByApp = false;
let stopping = false;
let quitting = false;
let currentHealth = null;
let runtime = {
  state: "closed",
  startupPhase: "Not running",
  error: null,
  warnings: [],
  startedAt: null,
};

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

function ensureDirectories() {
  for (const directory of [SUPPORT_DIR, LOG_DIR, DOWNLOAD_DIR]) fs.mkdirSync(directory, { recursive: true });
}

function appendLog(message) {
  ensureDirectories();
  fs.appendFileSync(ELECTRON_LOG, `[${new Date().toISOString()}] ${message}\n`);
}

function loadRuntimeConfig() {
  const defaults = {
    dataDir: path.join(os.homedir(), "Documents", "Osiris Vault"),
    pgBin: "/opt/homebrew/opt/postgresql@16/bin",
    ffmpeg: "/opt/homebrew/bin/ffmpeg",
    pdftoppm: "/opt/homebrew/bin/pdftoppm",
    codex: "/opt/homebrew/bin/codex",
    ytDlp: "/Library/Frameworks/Python.framework/Versions/3.13/bin/yt-dlp",
    updateFeed: null,
    transcribePython: app.isPackaged
      ? path.join(SUPPORT_DIR, "runtime", "venv", "bin", "python")
      : path.join(APP_ROOT, ".venv", "bin", "python"),
  };
  if (app.isPackaged && fs.existsSync(path.join(NATIVE_ROOT, "postgres", "bin", "postgres"))) {
    defaults.pgBin = path.join(NATIVE_ROOT, "postgres", "bin");
    defaults.ffmpeg = path.join(NATIVE_ROOT, "tools", "bin", "ffmpeg");
    defaults.pdftoppm = path.join(NATIVE_ROOT, "tools", "bin", "pdftoppm");
  }
  try {
    const loaded = { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) };
    if (app.isPackaged && !loaded.preferSystemTools && fs.existsSync(path.join(NATIVE_ROOT, "postgres", "bin", "postgres"))) {
      loaded.pgBin = path.join(NATIVE_ROOT, "postgres", "bin");
      loaded.ffmpeg = path.join(NATIVE_ROOT, "tools", "bin", "ffmpeg");
      loaded.pdftoppm = path.join(NATIVE_ROOT, "tools", "bin", "pdftoppm");
    }
    return loaded;
  } catch {
    return defaults;
  }
}

function saveRuntimeConfig(changes) {
  ensureDirectories();
  const next = { ...loadRuntimeConfig(), ...changes };
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function executable(candidate, fallbackName) {
  if (candidate && fs.existsSync(candidate)) return candidate;
  try {
    return execFileSync("/usr/bin/which", [fallbackName], {
      encoding: "utf8",
      env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}` },
    }).trim();
  } catch {
    return null;
  }
}

function resolveTools(config) {
  const pg = (name) => executable(path.join(config.pgBin, name), name);
  return {
    pgCtl: pg("pg_ctl"), initdb: pg("initdb"), psql: pg("psql"), createdb: pg("createdb"),
    ffmpeg: executable(config.ffmpeg, "ffmpeg"),
    pdftoppm: executable(config.pdftoppm, "pdftoppm"),
    codex: executable(config.codex, "codex"),
    ytDlp: executable(config.ytDlp, "yt-dlp"),
    transcribePython: executable(config.transcribePython, "python3"),
  };
}

function preflight() {
  const config = loadRuntimeConfig();
  const tools = resolveTools(config);
  const missingCore = ["pgCtl", "initdb", "psql", "createdb"].filter((key) => !tools[key]);
  fs.mkdirSync(config.dataDir, { recursive: true });
  if (!fs.existsSync(SERVER_ENTRY)) {
    throw new Error(app.isPackaged
      ? "The packaged Next.js server is missing. Reinstall Osiris Vault.app."
      : "The local Next.js server is not built. Run npm run build once, then reopen the desktop app.");
  }
  if (!fs.existsSync(SCHEMA_PATH)) throw new Error("The database schema is missing. Reinstall Osiris Vault.app.");
  if (missingCore.length) {
    throw new Error("PostgreSQL 16 is required but its local tools were not found. Repair it with: brew install postgresql@16");
  }
  const warnings = [];
  if (!tools.ffmpeg) warnings.push("FFmpeg is missing; video previews and transcription audio will be unavailable. Repair: brew install ffmpeg");
  if (!tools.pdftoppm) warnings.push("Poppler is missing; PDF previews will be unavailable. Repair: brew install poppler");
  if (!tools.ytDlp) warnings.push("yt-dlp is missing; YouTube captions and audio import will be unavailable. Repair: python3 -m pip install yt-dlp");
  if (!tools.transcribePython || !fs.existsSync(TRANSCRIBE_SCRIPT)) warnings.push("Whisper is not ready. Use Osiris Vault → Install Transcription Module.");
  if (!tools.codex) warnings.push("Codex CLI is missing; local board chat will be unavailable until Codex is installed.");
  return { config, tools, warnings };
}

function runtimeEnv(config, tools) {
  const user = process.env.USER || os.userInfo().username;
  return {
    ...process.env,
    PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}`,
    VAULT_PROJECT_DIR: APP_ROOT,
    VAULT_DATA_DIR: config.dataDir,
    VAULT_LOG_DIR: LOG_DIR,
    VAULT_RUNTIME_DIR: SUPPORT_DIR,
    VAULT_SCHEMA_PATH: SCHEMA_PATH,
    VAULT_MANAGED_BY: "electron",
    VAULT_PG_BIN: path.dirname(tools.pgCtl),
    VAULT_PG_PORT: String(PG_PORT),
    VAULT_PG_DATABASE: "osiris_vault",
    VAULT_PG_USER: user,
    DATABASE_URL: `postgresql://${encodeURIComponent(user)}@127.0.0.1:${PG_PORT}/osiris_vault`,
    HOSTNAME: LOCAL_HOST,
    PORT: String(APP_PORT),
    FFMPEG_BIN: tools.ffmpeg || "ffmpeg",
    PDFTOPPM_BIN: tools.pdftoppm || "pdftoppm",
    PDFTOTEXT_BIN: app.isPackaged && fs.existsSync(path.join(NATIVE_ROOT, "tools", "bin", "pdftotext")) ? path.join(NATIVE_ROOT, "tools", "bin", "pdftotext") : "pdftotext",
    YTDLP_BIN: tools.ytDlp || "yt-dlp",
    CODEX_BIN: tools.codex || "codex",
    TRANSCRIBE_PYTHON: tools.transcribePython || "python3",
    TRANSCRIBE_SCRIPT,
    WHISPER_MODEL: process.env.WHISPER_MODEL || "base",
    VAULT_APP_VERSION: app.getVersion(),
    ELECTRON_RUN_AS_NODE: "1",
  };
}

function nodeScript(file, env, timeout = 120_000) {
  return execFileAsync(process.execPath, [file], { cwd: APP_ROOT, env, timeout, maxBuffer: 20_000_000 });
}

async function postgresIsRunning(tools, config) {
  const pgData = path.join(config.dataDir, "postgres");
  if (!fs.existsSync(path.join(pgData, "PG_VERSION"))) return false;
  try {
    await execFileAsync(tools.pgCtl, ["-D", pgData, "status"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function fetchJson(url, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers: { Accept: "application/json" } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try { resolve({ statusCode: response.statusCode, body: JSON.parse(body || "{}") }); }
        catch (error) { reject(error); }
      });
    });
    request.on("error", reject);
    request.setTimeout(timeout, () => request.destroy(new Error("Health request timed out.")));
  });
}

async function health() {
  try {
    const response = await fetchJson(`${LOCAL_ORIGIN}/api/health`);
    if (response.statusCode === 200 && response.body?.ok && response.body?.app === APP_NAME) return response.body;
  } catch { /* closed or occupied by a non-HTTP process */ }
  return null;
}

function listeningPids(port) {
  try {
    return execFileSync("/usr/sbin/lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" })
      .trim().split("\n").map(Number).filter(Boolean);
  } catch {
    return [];
  }
}

async function waitForHealth() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const result = await health();
    if (result) return result;
    if (serverProcess?.exitCode !== null) throw new Error("The packaged server exited before it became healthy. Open the logs for details.");
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Osiris Vault did not become healthy within 45 seconds. Open the logs for details.");
}

function statusSnapshot() {
  const config = loadRuntimeConfig();
  return {
    state: runtime.state,
    health: currentHealth,
    ownership: serverProcess ? "managed" : runtime.state === "external" ? "external" : "none",
    managedBy: currentHealth?.managedBy || null,
    databaseStatus: currentHealth?.database?.status || (postgresStartedByApp ? "starting" : "stopped"),
    dataPath: config.dataDir,
    localUrl: `${LOCAL_ORIGIN}/`,
    startupPhase: runtime.startupPhase,
    error: runtime.error,
    warnings: runtime.warnings,
    startedAt: runtime.startedAt,
  };
}

async function refreshStatus() {
  if (runtime.state === "starting" || runtime.state === "error") return statusSnapshot();
  currentHealth = await health();
  if (currentHealth && serverProcess) runtime.state = "open";
  else if (currentHealth) runtime.state = "external";
  else if (!serverProcess) runtime.state = "closed";
  return statusSnapshot();
}

function writeServerPid() {
  if (serverProcess?.pid) fs.writeFileSync(PID_PATH, `${serverProcess.pid}\n`, "utf8");
}

function clearStalePid() {
  try {
    const pid = Number(fs.readFileSync(PID_PATH, "utf8").trim());
    if (!pid) return fs.rmSync(PID_PATH, { force: true });
    try { process.kill(pid, 0); }
    catch { fs.rmSync(PID_PATH, { force: true }); appendLog(`removed stale server pid ${pid}`); }
  } catch { /* no pid file */ }
}

function startServer(env) {
  ensureDirectories();
  const output = fs.openSync(SERVER_LOG, "a");
  serverProcess = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: SERVER_ROOT,
    env,
    stdio: ["ignore", output, output],
    detached: false,
  });
  writeServerPid();
  serverProcess.once("exit", (code, signal) => {
    fs.rmSync(PID_PATH, { force: true });
    serverProcess = null;
    appendLog(`server exited code=${code ?? ""} signal=${signal ?? ""}`);
    if (!stopping && !quitting && runtime.state === "open") {
      runtime = { ...runtime, state: "error", startupPhase: "Server stopped", error: "The local server stopped unexpectedly. Open logs for details." };
      currentHealth = null;
      loadControl().catch(() => {});
    }
  });
}

async function startVault() {
  if (runtime.state === "starting") return statusSnapshot();
  runtime = { ...runtime, state: "starting", startupPhase: "Checking local runtime", error: null, warnings: [] };
  try {
    const existing = await health();
    if (existing) {
      currentHealth = existing;
      runtime = { ...runtime, state: "external", startupPhase: "Using existing local server", startedAt: new Date().toISOString() };
      await loadVault();
      return statusSnapshot();
    }
    const occupied = listeningPids(APP_PORT);
    if (occupied.length) {
      throw new Error(`Port ${APP_PORT} is already used by another process (PID ${occupied.join(", ")}). Osiris Vault did not stop or kill it. Close that application, then try again.`);
    }

    const { config, tools, warnings } = preflight();
    runtime.warnings = warnings;
    const env = runtimeEnv(config, tools);
    const wasRunning = await postgresIsRunning(tools, config);

    runtime.startupPhase = "Starting PostgreSQL";
    await nodeScript(path.join(RUNTIME_SCRIPTS, "start-postgres.mjs"), env);
    postgresStartedByApp = !wasRunning;

    runtime.startupPhase = "Creating a safety backup";
    await nodeScript(path.join(RUNTIME_SCRIPTS, "backup-vault.mjs"), env);

    runtime.startupPhase = "Applying safe schema updates";
    await nodeScript(path.join(RUNTIME_SCRIPTS, "apply-schema.mjs"), env);

    if (fs.existsSync(path.join(config.dataDir, "vault.sqlite")) && !fs.existsSync(path.join(config.dataDir, ".portable-imported.json"))) {
      runtime.startupPhase = "Importing portable vault";
      await nodeScript(path.join(RUNTIME_SCRIPTS, "import-portable.mjs"), env, 30 * 60 * 1000);
    }

    runtime.startupPhase = "Writing vault manifest";
    await nodeScript(path.join(RUNTIME_SCRIPTS, "write-vault-manifest.mjs"), env);

    runtime.startupPhase = "Starting the private web server";
    startServer(env);
    currentHealth = await waitForHealth();
    runtime = { ...runtime, state: "open", startupPhase: "Ready", error: null, startedAt: new Date().toISOString() };
    appendLog(`vault opened pid=${serverProcess?.pid || "external"}`);
    await loadVault();
    return statusSnapshot();
  } catch (error) {
    appendLog(`start failed: ${error.stack || error.message}`);
    await stopManagedRuntime({ stopDatabase: true, loadLanding: false });
    runtime = { ...runtime, state: "error", startupPhase: "Start failed", error: error.message || String(error) };
    return statusSnapshot();
  }
}

async function terminateServer() {
  if (!serverProcess) return;
  const child = serverProcess;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (serverProcess === child) child.kill("SIGKILL");
  serverProcess = null;
  fs.rmSync(PID_PATH, { force: true });
}

async function stopManagedRuntime({ stopDatabase = true, loadLanding = true } = {}) {
  stopping = true;
  try {
    await terminateServer();
    if (stopDatabase && postgresStartedByApp) {
      try {
        const { config, tools } = preflight();
        await nodeScript(path.join(RUNTIME_SCRIPTS, "stop-postgres.mjs"), runtimeEnv(config, tools));
      } catch (error) {
        appendLog(`postgres stop warning: ${error.message}`);
      }
    }
    postgresStartedByApp = false;
    currentHealth = await health();
    runtime = {
      ...runtime,
      state: currentHealth ? "external" : "closed",
      startupPhase: currentHealth ? "External server still running" : "Not running",
      error: null,
      startedAt: null,
    };
    if (loadLanding) await loadControl();
    return statusSnapshot();
  } finally {
    stopping = false;
  }
}

async function stopVault() {
  if (!serverProcess) {
    currentHealth = await health();
    runtime.state = currentHealth ? "external" : "closed";
    if (currentHealth) runtime.error = "This server was started outside Osiris Vault.app, so the app left it running.";
    await loadControl();
    return statusSnapshot();
  }
  return stopManagedRuntime();
}

function allowLocalNavigation(url) {
  try {
    const target = new URL(url);
    return target.origin === LOCAL_ORIGIN || target.protocol === "file:" && target.pathname.endsWith("control.html");
  } catch {
    return false;
  }
}

function createWindow() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  const window = new BrowserWindow({
    x: area.x, y: area.y, width: area.width, height: area.height,
    minWidth: 980, minHeight: 680,
    title: APP_NAME, backgroundColor: "#0c0d0c", show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.once("ready-to-show", () => { window.show(); window.focus(); });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (allowLocalNavigation(url)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (allowLocalNavigation(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });
  return window;
}

async function loadControl() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  await mainWindow.loadFile(CONTROL_FILE);
}

async function loadVault() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  await mainWindow.loadURL(`${LOCAL_ORIGIN}/`);
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow();
    return refreshStatus().then((status) => status.state === "open" || status.state === "external" ? loadVault() : loadControl());
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function runVaultUtility(script, label, extraEnv = {}, timeout = 120_000) {
  try {
    const { config, tools } = preflight();
    if (!await postgresIsRunning(tools, config)) throw new Error("Start Osiris Vault before running this action.");
    const { stdout } = await nodeScript(path.join(RUNTIME_SCRIPTS, script), { ...runtimeEnv(config, tools), ...extraEnv }, timeout);
    if (Notification.isSupported()) new Notification({ title: APP_NAME, body: `${label} completed.` }).show();
    appendLog(`${label.toLowerCase()} completed: ${stdout.trim().split("\n").at(-1) || "ok"}`);
    return stdout.trim();
  } catch (error) {
    appendLog(`${label.toLowerCase()} failed: ${error.message}`);
    dialog.showErrorBox(`${label} failed`, error.message);
    return null;
  }
}

async function installTranscriptionModule() {
  const choice = dialog.showMessageBoxSync(mainWindow, { type: "question", buttons: ["Install Module", "Cancel"], defaultId: 0, cancelId: 1, title: APP_NAME, message: "Install local transcription support?", detail: "This downloads the faster-whisper Python package into Application Support. Models download locally only when transcription is first used." });
  if (choice !== 0) return;
  try {
    const config = loadRuntimeConfig();
    const tools = resolveTools(config);
    const { stdout } = await nodeScript(path.join(RUNTIME_SCRIPTS, "install-transcription-module.mjs"), runtimeEnv(config, tools));
    saveRuntimeConfig({ transcribePython: stdout.trim().split("\n").at(-1) });
    if (Notification.isSupported()) new Notification({ title: APP_NAME, body: "Local transcription module installed." }).show();
  } catch (error) { dialog.showErrorBox("Transcription installation failed", error.message); }
}

async function chooseVaultFolder() {
  if (serverProcess || await health()) {
    dialog.showMessageBoxSync(mainWindow, { type: "info", title: APP_NAME, message: "Stop the Vault before switching data folders." });
    return statusSnapshot();
  }
  const result = await dialog.showOpenDialog(mainWindow, { title: "Choose or create an Osiris Vault folder", properties: ["openDirectory", "createDirectory", "promptToCreate"] });
  if (result.canceled || !result.filePaths[0]) return statusSnapshot();
  const dataDir = result.filePaths[0];
  fs.mkdirSync(dataDir, { recursive: true });
  saveRuntimeConfig({ dataDir });
  runtime = { ...runtime, state: "closed", startupPhase: "Vault folder selected", error: null };
  await loadControl();
  return statusSnapshot();
}

function newerVersion(candidate, current) {
  const left = String(candidate).split(".").map(Number);
  const right = String(current).split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) > (right[index] || 0);
  }
  return false;
}

async function checkForUpdates(manual = false) {
  const config = loadRuntimeConfig();
  if (!config.updateFeed) {
    if (manual) dialog.showMessageBoxSync(mainWindow, { type: "info", title: APP_NAME, message: `Osiris Vault ${app.getVersion()} is installed.`, detail: "No team update feed is configured yet. Signed release ZIP files can still replace the application without replacing your vault folder." });
    return null;
  }
  try {
    const response = await fetch(config.updateFeed, { signal: AbortSignal.timeout(15_000), headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Update feed returned HTTP ${response.status}.`);
    const release = await response.json();
    saveRuntimeConfig({ lastUpdateCheck: new Date().toISOString() });
    if (!newerVersion(release.version, app.getVersion())) {
      if (manual) dialog.showMessageBoxSync(mainWindow, { type: "info", title: APP_NAME, message: "Osiris Vault is up to date.", detail: `Installed version: ${app.getVersion()}` });
      return release;
    }
    if (Notification.isSupported()) new Notification({ title: "Osiris Vault update available", body: `Version ${release.version} is ready.` }).show();
    const choice = dialog.showMessageBoxSync(mainWindow, { type: "info", buttons: release.url ? ["Open download", "Later"] : ["OK"], defaultId: 0, cancelId: release.url ? 1 : 0, title: APP_NAME, message: `Osiris Vault ${release.version} is available.`, detail: release.notes || "The update replaces only the application. Your external vault remains untouched." });
    if (choice === 0 && release.url) shell.openExternal(release.url);
    return release;
  } catch (error) {
    appendLog(`update check failed: ${error.message}`);
    if (manual) dialog.showErrorBox("Update check failed", `${error.message}\n\nThe Vault remains fully usable offline.`);
    return null;
  }
}

function remindIfBackupOverdue() {
  try {
    const backupDir = path.join(loadRuntimeConfig().dataDir, "backups");
    const latest = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).filter((name) => name.endsWith(".dump")).map((name) => fs.statSync(path.join(backupDir, name)).mtimeMs).sort((a, b) => b - a)[0] : 0;
    if ((!latest || Date.now() - latest > 7 * 86400000) && Notification.isSupported()) new Notification({ title: APP_NAME, body: "Your vault backup is over seven days old. Use Osiris Vault → Back Up Vault." }).show();
  } catch { /* Reminder failures never block startup. */ }
}

function installMenu() {
  const template = [
    { label: APP_NAME, submenu: [
      { label: "Start Osiris Vault", click: () => startVault() },
      { label: "Stop Vault", click: () => stopVault() },
      { type: "separator" },
      { label: "Open Data Folder", click: () => shell.openPath(loadRuntimeConfig().dataDir) },
      { label: "Open Logs", click: () => shell.openPath(LOG_DIR) },
      { label: "Choose Vault Folder…", click: () => chooseVaultFolder() },
      { type: "separator" },
      { label: "Back Up Vault", click: () => runVaultUtility("backup-vault.mjs", "Vault backup") },
      { label: "Check Vault Integrity", click: () => runVaultUtility("check-vault.mjs", "Integrity check") },
      { label: "Export Portable Vault", click: async () => { const output = await runVaultUtility("export-portable.mjs", "Portable export", { VAULT_EXPORT_WITH_FILES: "1" }, 30 * 60 * 1000); if (output) shell.showItemInFolder(output.trim().split("\n").at(-1)); } },
      { label: "Install Transcription Module…", click: () => installTranscriptionModule() },
      { label: "Check for Updates…", click: () => checkForUpdates(true) },
      { type: "separator" },
      { role: "quit" },
    ] },
    { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle("osiris-vault:get-runtime-status", () => refreshStatus());
ipcMain.handle("osiris-vault:start", () => startVault());
ipcMain.handle("osiris-vault:stop", () => stopVault());
ipcMain.handle("osiris-vault:reveal-data-folder", () => shell.openPath(loadRuntimeConfig().dataDir));
ipcMain.handle("osiris-vault:reveal-logs-folder", () => shell.openPath(LOG_DIR));
ipcMain.handle("osiris-vault:choose-vault-folder", () => chooseVaultFolder());

app.whenReady().then(async () => {
  ensureDirectories();
  clearStalePid();
  installMenu();
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.on("will-download", (_event, item) => item.setSavePath(path.join(DOWNLOAD_DIR, item.getFilename())));
  mainWindow = createWindow();
  await refreshStatus();
  await loadControl();
  remindIfBackupOverdue();
  checkForUpdates(false);
  setInterval(() => checkForUpdates(false), 24 * 60 * 60 * 1000).unref();
});

app.on("second-instance", () => showWindow());
app.on("activate", () => showWindow());
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

app.on("before-quit", async (event) => {
  if (quitting) return;
  event.preventDefault();
  if (serverProcess) {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: "question",
      buttons: ["Stop Vault and Quit", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      title: APP_NAME,
      message: "Stop the local Vault and quit?",
      detail: "The Next.js server and PostgreSQL started by this app will shut down gracefully. Your files and database remain on this Mac.",
    });
    if (choice !== 0) return;
  }
  quitting = true;
  await stopManagedRuntime({ stopDatabase: true, loadLanding: false });
  app.quit();
});
