import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const electronApp = path.join(root, "node_modules", "electron", "dist", "Electron.app");
const electronInstaller = path.join(root, "node_modules", "electron", "install.js");
const output = path.join(root, "dist", "electron", "Canvas Vault.app");
const resources = path.join(output, "Contents", "Resources");
const packagedApp = path.join(resources, "app");
const standalone = path.join(root, ".next", "standalone");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.status !== 0) process.exit(result.status || 1);
}

if (!existsSync(electronApp) && existsSync(electronInstaller)) run(process.execPath, [electronInstaller]);
if (!existsSync(electronApp)) throw new Error("Electron is not installed. Run npm install first.");
run("npm", ["run", "build"]);
if (!existsSync(path.join(standalone, "server.js"))) throw new Error("Next.js standalone server was not produced.");

rmSync(output, { recursive: true, force: true });
mkdirSync(path.dirname(output), { recursive: true });
run("/usr/bin/ditto", [electronApp, output]);
const originalExecutable = path.join(output, "Contents", "MacOS", "Electron");
const brandedExecutable = path.join(output, "Contents", "MacOS", "Canvas Vault");
if (existsSync(originalExecutable)) cpSync(originalExecutable, brandedExecutable);
rmSync(originalExecutable, { force: true });
rmSync(packagedApp, { recursive: true, force: true });
mkdirSync(packagedApp, { recursive: true });

cpSync(path.join(root, "desktop-electron"), path.join(packagedApp, "desktop-electron"), { recursive: true });
cpSync(standalone, path.join(packagedApp, "server"), { recursive: true });
const compiledNextServer = path.join(root, "node_modules", "next", "dist", "compiled", "next-server");
const packagedNextServer = path.join(packagedApp, "server", "node_modules", "next", "dist", "compiled", "next-server");
mkdirSync(packagedNextServer, { recursive: true });
for (const file of readdirSync(compiledNextServer).filter((name) => name.endsWith("runtime.prod.js"))) {
  cpSync(path.join(compiledNextServer, file), path.join(packagedNextServer, file));
}
if (existsSync(path.join(root, "public"))) cpSync(path.join(root, "public"), path.join(packagedApp, "server", "public"), { recursive: true });
mkdirSync(path.join(packagedApp, "server", ".next"), { recursive: true });
cpSync(path.join(root, ".next", "static"), path.join(packagedApp, "server", ".next", "static"), { recursive: true });

const tracedModules = path.join(packagedApp, "server", ".next", "node_modules");
if (existsSync(tracedModules)) {
  for (const name of readdirSync(tracedModules)) {
    const link = path.join(tracedModules, name);
    if (!lstatSync(link).isSymbolicLink()) continue;
    const target = readlinkSync(link);
    if (!path.isAbsolute(target)) continue;
    unlinkSync(link);
    symlinkSync(path.join("..", "..", "node_modules", path.basename(target)), link);
  }
}

const runtime = path.join(packagedApp, "runtime");
const runtimeScripts = path.join(runtime, "scripts");
mkdirSync(runtimeScripts, { recursive: true });
for (const file of ["postgres-config.mjs", "start-postgres.mjs", "stop-postgres.mjs", "apply-schema.mjs"]) {
  cpSync(path.join(root, "scripts", file), path.join(runtimeScripts, file));
}
cpSync(path.join(root, "scripts", "schema.sql"), path.join(runtime, "schema.sql"));
cpSync(path.join(root, "scripts", "transcribe.py"), path.join(runtime, "transcribe.py"));
for (const file of ["vault-runtime.mjs", "write-vault-manifest.mjs", "backup-vault.mjs", "check-vault.mjs", "export-portable.mjs", "import-portable.mjs", "install-transcription-module.mjs"]) {
  cpSync(path.join(root, "scripts", file), path.join(runtimeScripts, file));
}
run("node", [path.join(root, "scripts", "bundle-native-tools.mjs"), path.join(packagedApp, "native")]);

const copiedPackages = new Set();
function copyPackageClosure(name) {
  if (copiedPackages.has(name)) return;
  copiedPackages.add(name);
  const source = path.join(root, "node_modules", ...name.split("/"));
  const manifestPath = path.join(source, "package.json");
  if (!existsSync(manifestPath)) return;
  const destination = path.join(packagedApp, "server", "node_modules", ...name.split("/"));
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
    copyPackageClosure(dependency);
  }
}
for (const externalPackage of ["pg", "jsdom", "mammoth"]) copyPackageClosure(externalPackage);

writeFileSync(path.join(packagedApp, "package.json"), JSON.stringify({
  name: "canvas-v4-desktop",
  version: packageJson.version,
  private: true,
  main: "desktop-electron/main.js",
}, null, 2));

const iconPath = execFileSync(path.join(root, "scripts", "build-app-icon.sh"), { cwd: root, encoding: "utf8" }).trim();
cpSync(iconPath, path.join(resources, "CanvasV4.icns"));

const plist = path.join(output, "Contents", "Info.plist");
const plistBuddy = "/usr/libexec/PlistBuddy";
const set = (key, value) => run(plistBuddy, ["-c", `Set :${key} ${value}`, plist]);
set("CFBundleName", "Canvas Vault");
set("CFBundleDisplayName", "Canvas Vault");
set("CFBundleExecutable", "Canvas Vault");
set("CFBundleIdentifier", "com.osirismedici.canvas-v4");
set("CFBundleShortVersionString", packageJson.version);
set("CFBundleVersion", packageJson.version);
try { execFileSync(plistBuddy, ["-c", "Set :CFBundleIconFile CanvasV4.icns", plist]); }
catch { run(plistBuddy, ["-c", "Add :CFBundleIconFile string CanvasV4.icns", plist]); }

spawnSync("/usr/bin/xattr", ["-cr", output], { cwd: root, stdio: "ignore" });
run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", output]);
process.stdout.write(`${output}\n`);
