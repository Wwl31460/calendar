#!/usr/bin/env node
/**
 * 上传「已经构建好」的 APK：提交 → 推送 → 建 Release → 上传资产。
 * 与 release.mjs 的区别：不再重新打包，直接上传 dist/ 里已构建好的那一份。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { gh, getToken } from './lib/github-api.mjs';
import { pushViaApi } from './push-github.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWNER = 'Wwl31460';
const REPO = 'calendar';
const isWin = process.platform === 'win32';

const ver = fs.readFileSync(path.join(ROOT, 'www/js/updater.js'), 'utf8').match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const tag = `v${ver}`;
const fileName = `calendar-${tag}.apk`;
const apkPath = path.join(ROOT, 'dist', fileName);

if (!fs.existsSync(apkPath)) {
  console.error(`✗ 缺少 ${apkPath}`);
  process.exit(1);
}

const buf = fs.readFileSync(apkPath);
const size = buf.length;
const sha = crypto.createHash('sha256').update(buf).digest('hex');
console.log(`› ${fileName}  ${size} 字节  sha256=${sha}`);

const tk = getToken();
if (!tk) {
  console.error('✗ 未找到 token');
  process.exit(1);
}

const git = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', shell: isWin });
const commitMsg = `${tag}：图标改白底日历卡，日志支持标题与图片，课表支持图片导入与 PDF 手势缩放`;

git(['add', '-A']);
if (git(['diff', '--cached', '--quiet']).status !== 0) {
  // 说明里带空格时，shell:true 会被拆成多个 pathspec，改用 -F 传文件
  const msgFile = path.join(os.tmpdir(), 'calendar-commit-msg.txt');
  fs.writeFileSync(msgFile, commitMsg + '\n', 'utf8');
  const c = git(['-c', 'core.autocrlf=false', 'commit', '-F', msgFile]);
  console.log((c.stdout || '').trim() || (c.stderr || '').trim());
} else {
  console.log('› 无改动可提交');
}

let pushed = false;
const r = spawnSync('git', ['-c', 'http.version=HTTP/1.1', 'push', `https://${tk}@github.com/${OWNER}/${REPO}.git`, 'HEAD:refs/heads/main'],
  { cwd: ROOT, encoding: 'utf8', shell: isWin, timeout: 180000 });
if (r.status === 0) {
  pushed = true;
  console.log('› git push 成功');
} else {
  console.log('› git push 不可用，改走 API：' + ((r.stderr || '').split('\n').filter(Boolean).pop() || ''));
}
if (!pushed) {
  const res = await pushViaApi({ message: commitMsg, token: tk });
  console.log(`  已上传 ${res.uploaded} 个文件，删除 ${res.deleted} 个`);
}

const exists = await gh('GET', `/repos/${OWNER}/${REPO}/releases/tags/${tag}`, undefined, { token: tk });
if (exists.ok) {
  console.error(`✗ Release ${tag} 已存在`);
  process.exit(1);
}

const body = [
  '## 这次改了什么',
  '',
  '### 图标 / 小组件',
  '- Launcher 图标去掉整块蓝底，改成「白底日历卡」：顶部红条写「周五」，中间是大号日期数字，锁定当天信息',
  '- 桌面小组件同步为「11月6日 / 星期五」两行大字，跨天自动刷新',
  '',
  '### 日志',
  '- 新增**标题**：列表只显示标题，一眼找到；点开才看正文',
  '- 正文支持**插入相册图片**（可多选，保存前自动压缩，原图落在本地库里，不占流量）',
  '- 修复**日志删不掉**的 Bug：确认弹层的回调被关闭动画提前覆盖，导致点「删除」实际什么都没发生（提醒、课程删除同一处问题一并修好）',
  '',
  '### 课表',
  '- 导入支持**图片**：手机相册里的课表截图可以直接导入并保存原图，不再只认 PDF',
  '- 查看原文件支持**双指缩放**（1×–4×）、双击放大、**手动旋转**、横屏自动适配，放大后重新按高分辨率渲染，文字不糊',
  '- 课程信息新增**班级**字段（表单可填、导入自动识别、格子里显示「教室 · 班级」）',
  '- **PDF 解析重写**：改为按「节次」锚点分格，跨行合并的单元格也能落到正确行；课名不会被后面的教室/教师文字污染；教室识别范围放宽（楼/室/馆/场/机房/中心/校区）',
  '',
  '### 交互',
  '- 手机**返回键**按层级后退：先关弹层 / 关阅读器 / 退出设置页，退到最外层才真正退出 App，不再一按就退出',
  '- 底部「日历 / 课表 / 日志 / 提醒」四个 Tab **常驻最下方**，进入设置页也不再消失',
  '',
  '### 本次安装包校验值',
  `- 文件：\`${fileName}\``,
  `- 大小：**${size} 字节**（${(size / 1048576).toFixed(2)} MB）`,
  `- SHA-256：\`${sha}\``,
  '',
  '### 安装',
  '1. 手机浏览器下载下面的 APK，下载完在浏览器 / 文件管理里点开安装（覆盖安装即可，数据不丢）',
  '2. 若提示「安装未知应用」，允许浏览器安装应用；小米 / 红米如被「纯净模式」拦截，需在设置里放行一次',
  '3. 装好后，以后的更新可以直接在 App 内「设置 → 检查更新」完成',
].join('\n');

const created = await gh('POST', `/repos/${OWNER}/${REPO}/releases`, {
  tag_name: tag,
  target_commitish: 'main',
  name: `日历 ${ver}`,
  body,
  draft: false,
  prerelease: false
}, { token: tk });
if (!created.ok) {
  console.error(`✗ 创建 Release 失败：${created.status} ${created.text || ''}`);
  process.exit(1);
}
const release = created.data;
console.log(`› Release 已建：${release.html_url}`);

const up = await gh('POST',
  `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(fileName)}`,
  buf, { token: tk, raw: true });
if (!up.ok) {
  console.error(`✗ 上传失败：${up.status} ${up.text || ''}`);
  process.exit(1);
}
console.log(`✓ 上传完成：${up.data.browser_download_url}`);
console.log(`  ${size} 字节 / ${(size / 1048576).toFixed(2)} MB`);
