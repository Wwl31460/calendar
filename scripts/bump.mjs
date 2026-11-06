#!/usr/bin/env node
/**
 * 版本号统一升级：一处修改，网页 / APK / Service Worker 全部同步
 *
 *   node scripts/bump.mjs 1.0.1     指定版本号
 *   node scripts/bump.mjs           自动 +1 小版本（1.0.0 -> 1.0.1）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(ROOT, p), s, 'utf8');

const UPDATER = 'www/js/updater.js';
const GRADLE = 'android/app/build.gradle';
const SW = 'www/sw.js';
const PKG = 'package.json';

const cur = read(UPDATER).match(/APP_VERSION\s*=\s*'([^']+)'/);
const curCode = read(UPDATER).match(/VERSION_CODE\s*=\s*(\d+)/);
if (!cur || !curCode) {
  console.error('✗ 无法从 www/js/updater.js 读取当前版本');
  process.exit(1);
}

let next = process.argv[2];
if (!next) {
  const parts = cur[1].split('.').map(Number);
  parts[parts.length - 1] += 1;
  next = parts.join('.');
}
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`✗ 版本号格式应为 x.y.z，收到：${next}`);
  process.exit(1);
}
if (next === cur[1]) {
  console.error(`✗ 版本号未变化（仍是 ${next}）`);
  process.exit(1);
}

const nextCode = Number(curCode[1]) + 1;

// 1) 前端版本常量
let s = read(UPDATER);
s = s.replace(/APP_VERSION\s*=\s*'[^']+'/, `APP_VERSION = '${next}'`);
s = s.replace(/VERSION_CODE\s*=\s*\d+/, `VERSION_CODE = ${nextCode}`);
write(UPDATER, s);

// 2) Android 构建版本
s = read(GRADLE);
s = s.replace(/versionCode\s+\d+/, `versionCode ${nextCode}`);
s = s.replace(/versionName\s+"[^"]+"/, `versionName "${next}"`);
write(GRADLE, s);

// 3) Service Worker 缓存名
s = read(SW);
s = s.replace(/const CACHE = '[^']+'/, `const CACHE = 'calendar-app-v${next}'`);
write(SW, s);

// 4) package.json
const pkg = JSON.parse(read(PKG));
pkg.version = next;
write(PKG, JSON.stringify(pkg, null, 2) + '\n');

console.log(`✓ 版本已更新：${cur[1]} (${curCode[1]}) → ${next} (${nextCode})`);
console.log(`  下次运行 App 时，「设置 → 检查更新」会对比 GitHub Release 上的版本号。`);
