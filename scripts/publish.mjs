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
const commitMsg = `${tag}：用户登录 + 日志/提醒/课表云同步`;

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
  '## 这版加了「账号登录 + 云同步」',
  '',
  '### 1. 登录后，数据跟着账号走',
  '- 用户名 + 密码登录，初始账号 **吴文林 / 123456**（登录页底部点一下就填好）',
  '- 登录后**日志、提醒、课表、设置**都会同步到云端；换手机登录同一账号，原来存的都还在',
  '- 同步是**增量**的：只传改动的那几条，按「哪个设备最后改的以它为准」合并',
  '- **删除也会同步**：在 A 手机删掉的日志，B 手机同步后也会消失，不会「复活」',
  '- 改动后 2.5 秒自动上传；App 回到前台、重新打开时自动拉一次',
  '',
  '### 2. 设置页顶部多了账号卡片',
  '- 显示「吴 / 吴文林 / 已同步 · 今天 10:29」',
  '- 点开可以：立即同步 / 修改密码 / 退出登录',
  '',
  '### 3. 不登录也能用',
  '- 启动时可以选择「先不登录，只用本机数据」，功能一个不少，数据只留在手机里',
  '- 之后想同步了，进「设置 → 账号」随时登录',
  '',
  '### 4. 数据是怎么保护的',
  '- 密码在云端用 bcrypt 加盐哈希保存，手机上只留一个登录票据',
  '- 客户端**没有**数据表的直接读写权限，只能调用经过身份校验的接口，一个账号读不到另一个账号的数据',
  '',
  '### 本次安装包校验值',
  '- 文件：`' + fileName + '`',
  `- 大小：**${size} 字节**（${(size / 1048576).toFixed(2)} MB）`,
  '- SHA-256：`' + sha + '`',
  '',
  '### 安装',
  '覆盖安装即可，原来的日志、提醒、课表都还在（签名与前几版同一个证书）。',
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
