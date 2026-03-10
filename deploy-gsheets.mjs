#!/usr/bin/env node
/**
 * Google Sheets Add-on 部署脚本
 *
 * 流程：
 * 1. npm run build:gsheets → 生成 dist-gsheets/google-sheets.html
 * 2. 复制构建产物到 google-addon/Sidebar.html
 * 3. clasp push（需先配置 .clasp.json 中的 scriptId）
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DIST_HTML = path.join(__dirname, "dist-gsheets", "google-sheets.html");
const ADDON_DIR = path.join(__dirname, "google-addon");
const SIDEBAR_HTML = path.join(ADDON_DIR, "Sidebar.html");
const CLASP_JSON = path.join(ADDON_DIR, ".clasp.json");

console.log("=== Claude Office Plugin → Google Sheets 部署 ===\n");

// Step 1: Build
console.log("📦 构建 Google Sheets 单文件 HTML...");
try {
  execSync("npm run build:gsheets", { stdio: "inherit", cwd: __dirname });
} catch {
  console.error("❌ 构建失败，请检查错误信息。");
  process.exit(1);
}

// Step 2: Copy built HTML to google-addon/Sidebar.html
if (!fs.existsSync(DIST_HTML)) {
  console.error(`❌ 构建产物不存在: ${DIST_HTML}`);
  process.exit(1);
}

const html = fs.readFileSync(DIST_HTML, "utf-8");
const sizeKB = (Buffer.byteLength(html, "utf-8") / 1024).toFixed(1);
fs.writeFileSync(SIDEBAR_HTML, html, "utf-8");
console.log(`✅ 已复制到 google-addon/Sidebar.html (${sizeKB} KB)\n`);

// Step 3: clasp push
const claspConfig = JSON.parse(fs.readFileSync(CLASP_JSON, "utf-8"));
if (!claspConfig.scriptId || claspConfig.scriptId === "YOUR_SCRIPT_ID_HERE") {
  console.log("⚠️  请先配置 google-addon/.clasp.json 中的 scriptId。");
  console.log("   运行: clasp login && clasp create --type sheets");
  console.log("   然后将生成的 scriptId 填入 .clasp.json\n");
  console.log("📁 文件已准备就绪，跳过 clasp push。");
  process.exit(0);
}

console.log("🚀 推送到 Google Apps Script...");
try {
  execSync("npx clasp push", { stdio: "inherit", cwd: ADDON_DIR });
  console.log("\n✅ 部署完成！在 Google Sheets 中刷新即可看到更新。");
} catch {
  console.error("❌ clasp push 失败。请检查 clasp 登录状态和 scriptId 配置。");
  process.exit(1);
}
