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
// P0-1 개선: dist 폴더 전체 삭제 후 재생성 (이전 빌드 찌꺼기 제거)
// ============================================================================
console.log("🧹 Cleaning dist directory...");
if (fs.existsSync(dist)) {
  fs.rmSync(dist, { recursive: true, force: true });
  console.log("✓ Previous dist removed");
}
fs.mkdirSync(dist, { recursive: true });
console.log("✓ Fresh dist directory created\n");

// ============================================================================
// 필수 파일 및 디렉토리 정의
// ============================================================================

const REQUIRED_FILES = [
  "manifest.json",
  "service_worker.js",
  // P1-1: popup.html이 필요하다면 여기에 추가
  // 현재 manifest.json의 action.default_popup이 "index.html"을 사용하므로
  // popup.html은 불필요 (Vite가 index.html 생성)
  // 만약 popup.html을 사용한다면 아래 주석 해제:
  // "popup.html",
];

const REQUIRED_DIRS = [
  "content",
  "jobs",
  "storage",
  "signals",
  "ui",        // P0-2: UI 폴더 추가 (view_models.js, constants.js 등)
  // P1-2: 아이콘 및 정적 리소스 폴더 추가
  // 프로젝트에 해당 폴더가 있다면 주석 해제:
  // "assets",
  // "icons",
];

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

console.log("✅ Extension assets copied to dist/");
console.log("━".repeat(60));
