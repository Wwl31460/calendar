#!/usr/bin/env node
/**
 * 一条命令发新版：改版本号 → 打包 → 推送 → 建 GitHub Release 并上传 APK
 *
 *   set GITHUB_TOKEN=xxx
 *   node scripts/release.mjs 1.0.1 "修复xx问题"
 *
 * Token 获取：https://github.com/settings/tokens （勾 repo）
 * Token 也可以写在项目根目录 .github-token 文件里（已在 .gitignore 中）。
 *
 * 推送会先试 git push；若网络阻断 github.com 的 git 协议（会报 443 超时），
 * 自动改用 GitHub REST API 推送，只上传有变化的文件。
 * 有代理时设置 HTTPS_PROXY，API 与上传都会走代理。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gh, getToken } from './lib/github-api.mjs';
import { pushViaApi } from './push-github.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWNER = 'Wwl31460';
const REPO = 'calendar';
const isWin = process.platform === 'win32';

const version = process.argv[2];
const summary = process.argv[3] || '';

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  console.log(`› ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: isWin, ...opts });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} 执行失败`);
}

/** 尝试 git push，返回是否成功（不抛错、不退出） */
function tryGitPush(tk) {
  const remote = `https://${tk}@github.com/${OWNER}/${REPO}.git`;
  console.log('› 尝试 git push …');
  const r = spawnSync(
    'git',
    ['-c', 'http.version=HTTP/1.1', 'push', remote, 'HEAD:refs/heads/main'],
    { cwd: ROOT, encoding: 'utf8', shell: isWin, timeout: 180000 }
  );
  if (r.status === 0) {
    console.log('  git push 成功');
    return true;
  }
  const out = `${r.stderr || ''}${r.stdout || ''}`.trim();
  console.log(`  git push 不可用：${out.split('\n').filter(Boolean).pop() || '未知错误'}`);
  return false;
}

async function main() {
  const tk = getToken();
  if (!tk) {
    fail('未找到 GITHUB_TOKEN。请先执行：\n  set GITHUB_TOKEN=你的token\n或把 token 写入项目根目录 .github-token 文件');
  }

  // 1) 版本号
  if (version) {
    run('node', ['scripts/bump.mjs', version]);
  } else {
    console.log('› 未指定版本号，沿用当前版本打包');
  }

  const ver = fs.readFileSync(path.join(ROOT, 'www/js/updater.js'), 'utf8').match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
  const tag = `v${ver}`;

  // 2) 打包
  run('node', ['scripts/build-apk.mjs']);
  const apkPath = path.join(ROOT, `dist/calendar-${tag}.apk`);
  if (!fs.existsSync(apkPath)) fail(`未找到安装包 ${apkPath}`);

  // 3) 提交
  run('git', ['add', '-A']);
  const dirty = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: ROOT, shell: isWin }).status !== 0;
  const commitMsg = `${tag}${summary ? '：' + summary : ''}`;
  if (dirty) {
    run('git', ['-c', 'core.autocrlf=false', 'commit', '-m', commitMsg]);
  } else {
    console.log('› 没有需要提交的改动');
  }

  // 4) 推送（git 优先，失败自动走 API）
  if (!tryGitPush(tk)) {
    console.log('› 切换到 GitHub API 通道推送 …');
    const r = await pushViaApi({ message: commitMsg, token: tk });
    console.log(`  已上传 ${r.uploaded} 个文件，删除 ${r.deleted} 个`);
  }

  // 5) 建 Release
  console.log(`\n› 创建 Release ${tag}`);
  const exists = await gh('GET', `/repos/${OWNER}/${REPO}/releases/tags/${tag}`, undefined, { token: tk });
  if (exists.ok) {
    fail(`Release ${tag} 已存在，请换一个版本号，或先到网页删除它`);
  }

  const body = [
    summary || `日历 ${tag}`,
    '',
    '### 安装说明',
    '1. 手机点击下载下面的 APK',
    '2. 允许「安装未知来源应用」后完成安装',
    '3. 已装旧版的用户，也可以直接在 App 内「设置 → 检查更新」升级'
  ].join('\n');

  const created = await gh('POST', `/repos/${OWNER}/${REPO}/releases`, {
    tag_name: tag,
    target_commitish: 'main',
    name: `日历 ${ver}`,
    body,
    draft: false,
    prerelease: false
  }, { token: tk });
  if (!created.ok) fail(`创建 Release 失败：${created.status} ${created.text || ''}`);
  const release = created.data;

  // 6) 上传 APK
  const fileName = `calendar-${tag}.apk`;
  const size = fs.statSync(apkPath).size;
  console.log(`› 上传 ${fileName}（${(size / 1048576).toFixed(2)} MB）`);
  const up = await gh(
    'POST',
    `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(fileName)}`,
    fs.readFileSync(apkPath),
    { token: tk, raw: true }
  );
  if (!up.ok) fail(`上传 APK 失败：${up.status} ${up.text || ''}`);

  console.log(`\n✓ 发布完成：${tag}`);
  console.log(`  ${release.html_url}`);
  console.log(`  下载：https://ghfast.top/https://github.com/${OWNER}/${REPO}/releases/download/${tag}/${fileName}`);
  console.log('  手机上打开 App → 设置 → 检查更新，即可看到新版本。');
}

main().catch(e => fail(e.message || String(e)));
