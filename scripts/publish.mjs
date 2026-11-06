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
const commitMsg = `${tag}：重写更新下载器，分块并发+测速选源+卡住自动换源`;

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
  '## 修复「下载到 2% 就不动了」',
  '',
  '上一版更新时进度条经常停在 2% 再也不动 —— 那个 2% 其实是「开始下载」的初始显示值，',
  '真实原因是下载器只会「换源」，不会判断某个源**连上了但不给数据**：',
  '国内镜像（ghfast.top / gh-proxy.com）被限流时，连接是通的、每秒几百字节，',
  '旧逻辑里 40 秒内只要收到 1 个字节就不算超时，于是进度条永远停在原地。',
  '',
  '### 这次的下载器做了什么',
  '- **停滞检测**：12 秒内拿不到 20KB 就判定这个源卡死，立刻断开、换下一个源，并从已下载的位置**续传**（不用从头再来）',
  '- **分块并发**：3.5MB 的包切成 4 段同时下（每段独立 Range 请求、独立重试、独立换源）。镜像通常按**连接**限速，多连接能快 2~4 倍（本机实测：单连接 30s → 4 段并发 15s）',
  '- **下载前测速**：多个源各拉 48KB 计时，最快的源优先用。避免把「能连上但只有 8KB/s」的源当主源（实测这种源会让 3.5MB 下 110 秒）',
  '- **直连兜底**：镜像都不行时再试 github.com 官方地址',
  '- 新增第三个镜像 `ghproxy.net`（实测支持 Range、可断点续传）',
  '- 下载器抽成独立的 `ApkDownloader`，用 JDK 自带的 HTTP server 模拟「发 70KB 后彻底沉默」「限速 8KB/s」「不认 Range」「全部卡死」四种坏镜像做了压测，四种情况都能正确自愈或给出准确原因',
  '',
  '### 进度显示也改了',
  '- 一开始就显示 `0% · 正在连接下载源…`，不再用误导性的 2%',
  '- 下载中显示真实字节与速度：`1.42 MB / 3.36 MB · 186 KB/s`',
  '- 卡住 15 秒会提示 `这个下载源卡住了，正在自动换源续传…`，不会再让你盯着不动的进度条猜',
  '- 失败时列出 **4 个下载通道**（ghfast.top / gh-proxy.com / ghproxy.net / 官方直连），点哪个用浏览器下哪个，一个卡住就换下一个',
  '',
  '### 本次安装包校验值',
  `- 文件：\`${fileName}\``,
  `- 大小：**${size} 字节**（${(size / 1048576).toFixed(2)} MB）`,
  `- SHA-256：\`${sha}\``,
  '',
  '### 安装（这次仍需手动装一次）',
  '旧版的下载器就是坏的，所以这次还是得手动下载安装：',
  '1. 优先用**手机自带浏览器**（Chrome / 夸克 / 小米浏览器）打开下面的链接，别在微信里下',
  '2. 一个链接卡住就换另一个 —— 页面下方列出 3 个加速镜像 + 1 个官方地址',
  '3. 下载完确认大小是 **' + size.toLocaleString('en-US') + ' 字节**，再点击安装（覆盖安装，数据不丢）',
  '4. 装好 1.2.1 之后，以后在 App 内「设置 → 检查更新」就能正常自动下载了（新下载器带测速、分块和换源）',
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
