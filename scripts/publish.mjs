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
const commitMsg = `${tag}：图标按日期自动切换，日志图片可放大，课表按行序解析`;

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
  '## 图标终于会跟着日期变了',
  '',
  '你看到的「还是 6 号、星期五」不是缓存问题 —— 应用图标本来是一张写死的图片，',
  '系统不会替它改日期。Android 也没有「运行时换图标」的接口，所以这版换了个做法：',
  '',
  '- 预置 **7 个星期 × 31 个日期 = 217 张图标**，每一张对应一个 `<activity-alias>` 启动入口',
  '- 每天 0 点（以及开机、改时间/时区、升级后）自动启用「今天」那一个、关掉昨天的',
  '- 11 月 7 日就显示 **星期六 / 7**，8 号自动变成 **星期日 / 8**，不用手动做任何事',
  '',
  '### 图标也重新排了版',
  '- 内容缩进桌面图标的安全区（系统会把自适应图标四周各裁掉 18%），`星期六` 这种三个字不会再被切掉',
  '- 日期数字按可用宽高自动缩放，`31` 这类两位数也不会贴边',
  '- 顶部红条高度、字号、圆角都调整过，缩到桌面上的小尺寸仍然清楚',
  '',
  '## 日志里的图片可以点开了',
  '- 点一下缩略图 → 全屏查看，**双指缩放、双击放大、放大后拖动平移**',
  '- 同一条日志有多张图时，左右按钮或左右滑动切换，顶部显示 `1 / 3`',
  '- 返回键或右上角 × 关闭，不会误退出日志',
  '',
  '## 课表按你学校的排版解析',
  '- 单元格内按行序：**第 1 行课程名、第 2 行周次、第 3 行地点、之后是班级**',
  '- 被折行的班级会接回一整串（例如「软工2601、软工」+「2602」→「软工2601、软工2602」）',
  '- **不再导入授课教师**，课程详情里也去掉了这个输入框',
  '- 新增样例 `samples/课表样例2.pdf`，你这种排版和旧的「课名/教师/地点/周次」排版都验过，12 门课全对',
  '',
  '## 课表更好读',
  '- 第 **4 与第 5 节**、第 **8 与第 9 节**之间留出更宽的分隔带并加深颜色，上午 / 下午 / 晚上一眼分开',
  '- **今天那一列整列加淡色底**，配上表头的日期，找今天的课不用再数格子',
  '',
  '### 本次安装包校验值',
  `- 文件：\`${fileName}\``,
  `- 大小：**${size} 字节**（${(size / 1048576).toFixed(2)} MB）`,
  `- SHA-256：\`${sha}\``,
  '',
  '### 安装',
  '1.2.1 的下载器已经修好了，直接在这个页面点「下载」即可（也可以在 App 内「设置 → 检查更新」自动升级）。',
  '覆盖安装，数据不丢。',
  '',
  '如果自动更新还是卡住，用下面的直连通道手动下：',
  `- <https://ghfast.top/https://github.com/Wwl31460/calendar/releases/download/${tag}/${fileName}>`,
  `- <https://gh-proxy.org/https://github.com/Wwl31460/calendar/releases/download/${tag}/${fileName}>`,
  `- <https://github.com/Wwl31460/calendar/releases/download/${tag}/${fileName}>`,
  '',
  '> 图标换日是系统层面的动作：极少数第三方桌面在切换瞬间可能把图标挪到页面末尾，手动拖回原位即可。',
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
