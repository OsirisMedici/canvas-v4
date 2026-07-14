import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const output = process.argv[2];
if (!output) throw new Error("Pass the native runtime output directory.");
rmSync(output, { recursive: true, force: true });
const postgres = "/opt/homebrew/opt/postgresql@16";
const toolSources = {
  ffmpeg: "/opt/homebrew/bin/ffmpeg",
  ffprobe: "/opt/homebrew/bin/ffprobe",
  pdftoppm: "/opt/homebrew/bin/pdftoppm",
  pdftotext: "/opt/homebrew/bin/pdftotext",
};
function copyClean(source, destination) {
  const stat = statSync(source);
  if (stat.isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(source)) copyClean(path.join(source, entry), path.join(destination, entry));
    return;
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(source), { mode: stat.mode });
  chmodSync(destination, stat.mode);
}
if (!existsSync(path.join(postgres, "bin", "postgres"))) throw new Error("PostgreSQL 16 is required to build the team runtime.");
mkdirSync(path.join(output, "postgres"), { recursive: true });
mkdirSync(path.join(output, "postgres", "bin"), { recursive: true });
for (const name of ["postgres", "initdb", "pg_ctl", "createdb", "psql", "pg_dump", "pg_restore"]) copyClean(path.join(postgres, "bin", name), path.join(output, "postgres", "bin", name));
copyClean(path.join(postgres, "share"), path.join(output, "postgres", "share"));
if (existsSync(path.join(postgres, "lib", "postgresql"))) copyClean(path.join(postgres, "lib", "postgresql"), path.join(output, "postgres", "lib", "postgresql"));
mkdirSync(path.join(output, "tools", "bin"), { recursive: true });
for (const [name, source] of Object.entries(toolSources)) {
  if (!existsSync(source)) throw new Error(`${name} is required to build the team runtime.`);
  copyClean(source, path.join(output, "tools", "bin", name));
}
const libraryDir = path.join(output, "lib");
mkdirSync(libraryDir, { recursive: true });

function filesBelow(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesBelow(target));
    else if (entry.isFile() && !entry.isSymbolicLink()) files.push(target);
  }
  return files;
}

function rawDependencies(file) {
  try {
    const outputText = execFileSync("/usr/bin/otool", ["-L", file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return outputText.split("\n").slice(1).map((line) => line.trim().split(" ")[0]).filter(Boolean);
  } catch { return []; }
}

function isMachO(file) {
  try { return execFileSync("/usr/bin/file", ["-b", file], { encoding: "utf8" }).includes("Mach-O"); }
  catch { return false; }
}

const queue = filesBelow(output).filter(isMachO);
const scanned = new Set();
const sourceByFile = new Map();
function resolveRpath(origin, dependency) {
  const relative = dependency.slice("@rpath/".length);
  const candidates = [path.resolve(path.dirname(origin), relative), path.join("/opt/homebrew/lib", relative)];
  try { for (const formula of readdirSync("/opt/homebrew/opt")) candidates.push(path.join("/opt/homebrew/opt", formula, "lib", relative)); } catch { /* Homebrew root is validated above. */ }
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}
for (const name of ["postgres", "initdb", "pg_ctl", "createdb", "psql", "pg_dump", "pg_restore"]) sourceByFile.set(path.join(output, "postgres", "bin", name), path.join(postgres, "bin", name));
for (const [name, source] of Object.entries(toolSources)) sourceByFile.set(path.join(output, "tools", "bin", name), source);
for (let index = 0; index < queue.length; index += 1) {
  const file = queue[index];
  if (scanned.has(file)) continue;
  scanned.add(file);
  const origin = sourceByFile.get(file) || file;
  for (const dependency of rawDependencies(file)) {
    let source = dependency;
    if (dependency.startsWith("@loader_path/")) source = path.resolve(path.dirname(origin), dependency.slice("@loader_path/".length));
    else if (dependency.startsWith("@rpath/")) source = resolveRpath(origin, dependency);
    if (!source.startsWith("/opt/homebrew/") && !source.startsWith("/usr/local/")) continue;
    if (!existsSync(source)) continue;
    const destination = path.join(libraryDir, path.basename(source));
    if (!existsSync(destination)) {
      copyClean(source, destination);
      sourceByFile.set(destination, source);
      queue.push(destination);
    }
  }
}

const machFiles = [...new Set([...scanned, ...filesBelow(libraryDir).filter(isMachO)])];
for (const file of machFiles) {
  const changes = rawDependencies(file).filter((dependency) => existsSync(path.join(libraryDir, path.basename(dependency)))).flatMap((dependency) => ["-change", dependency, `@executable_path/../../lib/${path.basename(dependency)}`]);
  if (changes.length) execFileSync("/usr/bin/install_name_tool", [...changes, file], { stdio: "ignore" });
  if (file.startsWith(libraryDir) && /\.(dylib|so(?:\.|$))/.test(file)) {
    try { execFileSync("/usr/bin/install_name_tool", ["-id", `@executable_path/../../lib/${path.basename(file)}`, file], { stdio: "ignore" }); } catch { /* Some plugins have no install id. */ }
  }
}

for (const file of machFiles) {
  try { execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", file], { stdio: "ignore" }); } catch { /* Non-Mach-O data files are ignored. */ }
}

const runtime = {
  format: "com.osirismedici.canvas-vault.native-runtime",
  architecture: "arm64",
  builtAt: new Date().toISOString(),
  tools: Object.fromEntries(Object.keys(toolSources).map((name) => [name, `tools/bin/${name}`])),
  postgres: "postgres/bin",
  libraries: readdirSync(libraryDir).length,
};
writeFileSync(path.join(output, "runtime-manifest.json"), `${JSON.stringify(runtime, null, 2)}\n`);
process.stdout.write(`${output}\n`);
