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
const commitMsg = `${tag}：改用系统安装会话，修复 MIUI 上无法安装`;

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
  '## 修复「解析软件包时出现问题」',
  '',
  '上一版的下载校验已经生效（能识破被截断的文件），但安装环节在小米 / 红米等 MIUI 机型上仍会被系统拦下：',
  '',
  '```',
  'Permission Denial: opening provider androidx.core.content.FileProvider',
  '  from ProcessRecord{... com.miui.packageinstaller ...}',
  '  that is not exported from UID 10178',
  '```',
  '',
  '原因是旧做法把安装包以 `content://` 链接交给系统安装器，读取权限是**一次性授权**；',
  'MIUI 的安装器会把请求转给自己的另一个进程处理，这个授权没有跟着传过去，',
  '于是安装器读不到文件，界面就显示「解析软件包时出现问题」。**安装包本身是好的。**',
  '',
  '### 这次改了什么',
  '- 改用系统 **PackageInstaller 安装会话**：APK 字节由 App 自己写进系统暂存区，安装器不再需要读我们的文件，权限问题从根上消失',
  '- 会话提交后由 `InstallResultReceiver` 接回结果：成功 / 需确认 / 失败分别处理，失败会把系统给的原因**直接显示出来**（存储不足、签名冲突、被安全策略拦截等）',
  '- 安装失败时弹「系统拦截了这次安装」，并提供「用浏览器下载」的备用路径',
  '- 安装不再经过 FileProvider（仅保留为极老系统的兜底）',
  '',
  '### 本次安装包校验值',
  `- 文件：\`${fileName}\``,
  `- 大小：**${size} 字节**（${(size / 1048576).toFixed(2)} MB）`,
  `- SHA-256：\`${sha}\``,
  '',
  '### 安装（重要）',
  '这次修复本身装不上是没法「自动更新」的——旧版的安装通道就是坏的。所以：',
  '1. **本次请手动装一次**：用手机浏览器下载下面的 APK，下载完在浏览器/文件管理里点开安装',
  '2. 若提示「安装未知应用」，允许浏览器安装应用；小米/红米还需在「设置 → 应用设置 → 应用管理 → 右上角 → 特殊权限」中确认未被纯净模式拦截',
  '3. 装好 v1.1.3 之后，以后再更新就能在 App 内「设置 → 检查更新」一路自动完成',
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
