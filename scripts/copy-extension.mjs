import fs from "node:fs";
import path from "node:path";

const root = path.resolve();
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

// ============================================================================
// 필수 파일 및 디렉토리 정의
// ============================================================================

const REQUIRED_FILES = [
  "manifest.json",
  "service_worker.js",
  "metadata.json"
];

const REQUIRED_DIRS = [
  "content",
  "jobs",
  "risk",
  "storage",
  "signals",
  "ui",
  "utils"
];

// ============================================================================
// P0-1 수정: dist 전체 삭제 대신 확장 런타임 폴더만 Refresh
// Vite 빌드 결과물(assets, index.html 등)을 보존하기 위함
// ============================================================================
console.log("🧹 Cleaning extension runtime directories in dist/...");

// Ensure dist exists (in case vite build wasn't run first, though unlikely)
if (!fs.existsSync(dist)) {
  fs.mkdirSync(dist, { recursive: true });
}

// Clean only the specific extension folders defined in REQUIRED_DIRS
for (const dirName of REQUIRED_DIRS) {
  const targetDir = path.join(dist, dirName);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    console.log(`  ✓ Removed old dist/${dirName}`);
  }
}
console.log("✓ Extension runtime cleanup done\n");

// ============================================================================
// 1) 필수 파일 복사
// ============================================================================
console.log("📄 Copying required files...");
let filesCopied = 0;
for (const f of REQUIRED_FILES) {
  const src = path.join(root, f);
  const dst = path.join(dist, f);
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Warning: Missing required file: ${f}`);
    continue;
  }
  copyFile(src, dst);
  console.log(`  ✓ ${f}`);
  filesCopied++;
}
console.log(`✓ ${filesCopied} file(s) copied\n`);

// ============================================================================
// 2) 필수 디렉토리 복사
// ============================================================================
console.log("📁 Copying required directories...");
let dirsCopied = 0;
for (const d of REQUIRED_DIRS) {
  const src = path.join(root, d);
  const dst = path.join(dist, d);
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Warning: Missing required dir: ${d}/`);
    continue;
  }
  copyDir(src, dst);
  
  // 복사된 파일 개수 계산
  const fileCount = countFiles(dst);
  console.log(`  ✓ ${d}/ (${fileCount} file${fileCount !== 1 ? 's' : ''})`);
  dirsCopied++;
}
console.log(`✓ ${dirsCopied} director${dirsCopied !== 1 ? 'ies' : 'y'} copied\n`);

console.log("✅ Extension assets copied to dist/");
console.log("━".repeat(60));

// ============================================================================
// 유틸리티: 디렉토리 내 파일 개수 계산
// ============================================================================
function countFiles(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}
