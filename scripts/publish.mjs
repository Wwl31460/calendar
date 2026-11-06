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
const commitMsg = `${tag}：下载校验加固与断点续传`;

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
  '## 修复「下载后解码出错，安装不了」',
  '',
  '经逐项核查，服务器上的 APK 本身是完好的（ZIP 结构、v1/v2/v3 签名、zipalign 对齐、资源表编码、全部图片均正常，远端 MD5 与本地一致）。',
  '真正的问题出在**下载环节**：旧版 App 下载完成后只判断了「文件大于 4KB」，一旦镜像返回的是错误网页、或被网络中断成半截文件，它仍会把这份无效文件交给系统安装器，系统解析自然报「解码出错 / 解析包失败」。',
  '',
  '### 这次改了什么',
  '- 下载后先做 5 项校验：**字节数与服务端一致 → ZIP 结构完整（含清单与 dex）→ 系统能解析出包信息 → 包名与签名和当前版本一致 → 版本号更高**',
  '- 任一项不通过就删掉重下，并**自动换下一个下载源**，不再把坏文件丢给安装器',
  '- 下载改为**断点续传**：连接被掐断时保留已下载部分，用 HTTP Range 接着下，不必从头重来',
  '- 全部源都失败时，弹出「用浏览器下载」并告知**应得到的准确字节数**，便于自行核对',
  '',
  '### 本次安装包校验值',
  `- 文件：\`${fileName}\``,
  `- 大小：**${size} 字节**（${(size / 1048576).toFixed(2)} MB）`,
  `- SHA-256：\`${sha}\``,
  '',
  '> 如果下载到的文件大小与此不符，说明下载被截断，请换一个链接重下。',
  '',
  '### 安装',
  '1. 手机点击下方 APK 下载（或使用 jsDelivr 链接）',
  '2. 允许「安装未知来源应用」后完成安装',
  '3. 已装 v1.0.0 / v1.1.0 的用户可直接覆盖安装，数据保留',
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
