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
const commitMsg = `${tag}：升级后强制刷新桌面图标，打包时按当天生成默认图标`;

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
  '## 图标为什么还是旧的：原因已定位并修掉',
  '',
  '先说结论：**你手机上装的可能还是旧版**（1.2.1 的图标是写死的「周五 / 6」那五个字画在图上，',
  '而且文字超出了图标安全区，所以「周五」看不全）。这两件事在 v1.3.0 都已经改了。',
  '',
  '如果确实装了 v1.3.0 却仍显示旧图标，那是一个具体的技术原因，这版专门修了它：',
  '',
  '1. **桌面缓存**。覆盖安装时，桌面不会主动重新读取图标，它缓存着升级前那一张。',
  '   App 内部记录的是「今天的图标已经启用」，于是判定无需改动、什么都不做 —— 结果就是图标卡在旧日期。',
  '   现在收到「应用已更新」的广播会**强制刷新**：把今天这个入口先关再开（最终状态不变），',
  '   桌面收到变更就会重新取图标。',
  '2. **装完没打开 App 时的默认图标**。以前默认图标取决于「上次生成脚本那天」。',
  '   现在**每次构建都会重新生成 217 张图标，并把构建当天设为默认**，所以装完直接看桌面就是今天的日期。',
  '',
  '### 图标怎么做到「每天自动变」',
  '- Android 没有运行时改图标的 API，所以预置 **7 星期 × 31 日 = 217 张图标**，每张对应一个启动入口',
  '- 每天 0 点（以及开机、改时间/时区、升级后）只启用「今天」那一个，其它关掉',
  '- 11 月 7 日显示 **星期六 / 7**，8 号自动变成 **星期日 / 8**',
  '- 排版全部缩进桌面图标的安全区（系统会裁掉自适应图标四周各 18%，这就是原来「周五」被切掉的原因），',
  '  `星期六` 三个字完整可见，`31` 这种两位数也不贴边',
  '',
  '### 装完还是旧图标的话，按这个顺序试（30 秒）',
  '1. 打开 App 一次（会触发一次图标同步）',
  '2. 长按桌面图标 → 移除 → 再从应用列表拖回来（清掉桌面缓存的那张图）',
  '3. 重启桌面：设置 → 应用管理 → 找到你的桌面（小米桌面 / 华为桌面）→ 强行停止',
  '',
  '> 图标上只有「星期 + 日期」，没有「11月」。月份进图标会让组合从 217 涨到 2604 张（包大 3~4MB），',
  '> 而 48dp 的桌面图标塞 5 个字符也会挤成一团 —— iOS 日历图标也是这个做法。',
  '> 月份 + 完整日期在**桌面小组件**里（「11月7日 / 星期六」），那个是实时更新的。',
  '',
  '## 另外三件事（v1.3.0 已包含，这版一并交付）',
  '- **日志图片点一下就能放大**：全屏查看，双指缩放、双击放大、放大后拖动、左右切换同一日志的多张图，返回键关闭',
  '- **课表按你学校的行序解析**：第 1 行课程名、第 2 行周次、第 3 行地点、之后是班级；折行的班级会自动接回一整串；**不再导入教师**',
  '- **课表更好读**：第 4/5 节、第 8/9 节之间加宽并加深的分隔带；今天那一列整列加淡色底',
  '',
  '### 本次安装包校验值',
  '- 文件：`' + fileName + '`',
  `- 大小：**${size} 字节**（${(size / 1048576).toFixed(2)} MB）`,
  '- SHA-256：`' + sha + '`',
  '',
  '### 安装',
  '下载后直接覆盖安装，数据不丢（签名与前几版同一个证书）。',
  '',
  '一个通道下载不动就换下一个：',
  `- <https://ghfast.top/https://github.com/Wwl31460/calendar/releases/download/${tag}/${fileName}>`,
  `- <https://gh-proxy.org/https://github.com/Wwl31460/calendar/releases/download/${tag}/${fileName}>`,
  `- <https://gh-proxy.com/https://github.com/Wwl31460/calendar/releases/download/${tag}/${fileName}>`,
  `- <https://ghproxy.net/https://github.com/Wwl31460/calendar/releases/download/${tag}/${fileName}>`,
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
