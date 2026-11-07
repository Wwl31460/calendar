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
const commitMsg = `${tag}：修班级识别、图片双击放大、升级清 WebView 缓存、设置页可自检图标`;

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
  '## 这版修的是「改完还是老样子」的四个具体原因',
  '',
  '### 1. 课表班级一直没被识别（真 bug）',
  '上一版把「软工2601」这类班级当成了教室号：房号的正则也匹配「汉字 + 4 位数字」，',
  '于是班级那行被判定成「教室」——教室已经有值，就直接丢掉了。',
  '现在按「先认房号、再认班级」的规则拆开：带 `楼/室/馆/机房` 或 `教A305`、`教二108`、`B201` 才算教室，',
  '`软工2601`、`计算机2201-2`、`2026级3班`、`软工2601、软工2602` 都归班级。样例两版各 12 门，班级/地点/周次全对。',
  '',
  '### 2. 日志图片「点不开 / 打不开」',
  '- 缩略图现在点一下就是全屏大图（这个在 v1.3.0 就有了）',
  '- 这版补上**双击放大真正生效**：原来的双击判定只在触摸结束事件里，某些情况下没被触发。',
  '  现在放大以**你点的位置为中心**（点哪里看哪里），再双击还原',
  '- 支持双指缩放、放大后拖动平移、左右切换同一条日志的多张图片',
  '',
  '### 3. 覆盖安装后界面还是老样子（WebView 缓存）',
  '这是个容易被忽略的坑：APK 里明明是新代码，WebView 却拿缓存的 `index.html` / `js`，',
  '于是「装了新版但功能没变」。现在**版本号一变就清一次 WebView 缓存**，装完第一次打开就是新界面。',
  '',
  '### 4. 桌面图标还是旧日期',
  '- 打包时会把「构建当天」设为默认图标，装完不打开 App 也是今天',
  '- 覆盖安装收到「已更新」广播会**强制让桌面重读图标**（先关再开今天这个入口，最终状态不变）',
  '- **设置页新增「桌面图标」一行**：显示今天应为「11月7日 星期六」，点一下立即刷新，并给出「图标还是旧的怎么办」的步骤',
  '',
  '> 如果你手机上装的还是 1.2.x，上面这四条**都不会出现**——1.2.x 的图标是写死的「周五/6」，',
  '> 日志缩略图没有点击事件，课表没有班级、没有分隔带、也还在导入教师。',
  '> 判断方法：打开 App →「设置 → 检查更新」，那一行右边应显示 `v1.3.2`。',
  '',
  '### 本次安装包校验值',
  '- 文件：`' + fileName + '`',
  `- 大小：**${size} 字节**（${(size / 1048576).toFixed(2)} MB）`,
  '- SHA-256：`' + sha + '`',
  '',
  '### 安装',
  '覆盖安装即可，数据不丢（签名与前几版同一个证书）。',
  '',
  `- <https://ghfast.top/https://github.com/Wwl31460/calendar/releases/download/${tag}/${fileName}>`,
  `- <https://gh-proxy.org/https://github.com/Wwl31460/calendar/releases/download/${tag}/${fileName}>`,
  `- <https://gh-proxy.com/https://github.com/Wwl31460/calendar/releases/download/${tag}/${fileName}>`,
  `- <https://github.com/Wwl31460/calendar/releases/download/${tag}/${fileName}>`,
  '',
  '> 用手机自带浏览器 / Chrome / 夸克打开，别在微信里下。下载完确认大小是 ' + size.toLocaleString('en-US') + ' 字节再装。',
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
