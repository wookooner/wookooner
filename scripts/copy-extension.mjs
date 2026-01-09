import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const dist = path.join(root, "dist");

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDir(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else copyFile(src, dst);
  }
}

const REQUIRED_FILES = [
  "manifest.json",
  "service_worker.js",
];

const REQUIRED_DIRS = [
  "content",
  "jobs",
  "storage",
  "signals",
];

// 1) copy files
for (const f of REQUIRED_FILES) {
  const src = path.join(root, f);
  const dst = path.join(dist, f);
  if (!fs.existsSync(src)) {
    console.warn(`Warning: Missing required file: ${f}`);
    continue;
  }
  copyFile(src, dst);
}

// 2) copy dirs
for (const d of REQUIRED_DIRS) {
  const src = path.join(root, d);
  const dst = path.join(dist, d);
  if (!fs.existsSync(src)) {
    console.warn(`Warning: Missing required dir: ${d}/`);
    continue;
  }
  copyDir(src, dst);
}

console.log("Extension assets copied to dist/");