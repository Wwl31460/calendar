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
const commitMsg = `${tag}：原生闹钟响铃 + 桌面图标跨天更新修复`;

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
  '## 这版修的是「提醒不响」和「图标不更新」',
  '',
  '### 1. 提醒现在真的会响',
  '- 以前用的是通知插件，而它要的通知渠道从来没被创建，Android 8+ 会把通知**直接丢弃**——所以经常毫无反应',
  '- 现在改成系统闹钟：精确排程 + 前台服务，**走闹钟音量循环响铃 + 震动**，App 被划掉、锁屏也照响',
  '- 通知上的「关闭」可以停，或 60 秒后自动停；也可以选「5 分钟后再响」',
  '- 手机静音/震动模式下也不受影响（走的是闹钟音量）；闹钟音量为 0 时会在响铃期间临时抬到 60%，停铃后还原',
  '- 开机、改时间、覆盖升级后会自动重排，不会「重启一次就再也不响」',
  '',
  '### 2. 设置页多了「提醒响铃」自检',
  '- 一眼看到：通知权限 / 精确闹钟 / 电池优化 / 闹钟音量 / 已排多少条',
  '- 哪项没放行直接点进去开；「响铃测试」6 秒后真响一次，先确认手机能出声',
  '- 新增「允许后台自启动」入口（小米 / 华为 / OPPO / vivo / 魅族 / 三星 / 联想都能跳转）',
  '',
  '### 3. 桌面图标按时翻页',
  '- 根因一：原来只在打开 App 的那一刻切图标，而禁用「刚点进来的那张图标」会让系统把当前任务一起结束——这就是「点开闪退，闪退完图标才变」。现在改成**退出 App 之后**再切',
  '- 根因二：原来只排「下一次零点」一个闹钟，被系统吞一次就永久断链。现在一次排 7 天，外加当天 9 / 14 / 20 点三次兜底，任何一次触发都会把整组重排',
  '- 补上系统跨天广播（DATE_CHANGED）、开机、改时间、改时区、升级后的刷新',
  '',
  '### 4. 如果还是不准，多半是系统在清理后台',
  '- 手机管家「一键清理」会把已排的闹钟一起清掉，要到下次打开 App 才重排',
  '- 到「设置 → 提醒响铃 → 允许后台自启动」加白名单，并把电池优化设为「不限制」',
  '',
  '### 本次安装包校验值',
  '- 文件：`' + fileName + '`',
  `- 大小：**${size} 字节**（${(size / 1048576).toFixed(2)} MB）`,
  '- SHA-256：`' + sha + '`',
  '',
  '### 安装',
  '覆盖安装即可，原来的日志、提醒、课表、账号都还在（签名与前几版同一个证书）。',
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
