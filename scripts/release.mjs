#!/usr/bin/env node
/**
 * 一条命令发新版：改版本号 → 打包 → 提交推送 → 建 GitHub Release 并上传 APK
 *
 *   GITHUB_TOKEN=xxx node scripts/release.mjs 1.0.1 "修复xx问题"
 *
 * Token 获取：https://github.com/settings/tokens
 *   勾选 repo（或仅 Contents + Releases 的细粒度权限）即可。
 *
 * Token 也可以写在项目根目录的 .github-token 文件里（已在 .gitignore 中）。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWNER = 'Wwl31460';
const REPO = 'calendar';
const isWin = process.platform === 'win32';

const version = process.argv[2];
const summary = process.argv[3] || '';

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  const f = path.join(ROOT, '.github-token');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  return '';
}

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  console.log(`› ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: isWin, ...opts });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} 执行失败`);
}

async function main() {
  const tk = token();
  if (!tk) {
    fail('未找到 GITHUB_TOKEN。请先执行：\n  set GITHUB_TOKEN=你的token   （Windows）\n或把 token 写入项目根目录 .github-token 文件');
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

  // 3) 提交推送
  run('git', ['add', '-A']);
  const dirty = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: ROOT, shell: isWin }).status !== 0;
  if (dirty) {
    run('git', ['-c', 'core.autocrlf=false', 'commit', '-m', `${tag}${summary ? '：' + summary : ''}`]);
  } else {
    console.log('› 没有需要提交的改动');
  }

  const remote = `https://${tk}@github.com/${OWNER}/${REPO}.git`;
  run('git', ['push', remote, `HEAD:refs/heads/main`, '--force-with-lease']);

  // 4) 建 Release
  console.log(`\n› 创建 Release ${tag}`);
  const exists = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${tag}`, {
    headers: { Authorization: `Bearer ${tk}`, Accept: 'application/vnd.github+json' }
  });
  if (exists.status === 200) {
    fail(`Release ${tag} 已存在，请换一个版本号或先到网页删除它`);
  }

  const body = [
    summary || `日历 ${tag}`,
    '',
    '### 安装说明',
    '1. 手机点击下载下面的 APK',
    '2. 允许「安装未知来源应用」后完成安装',
    '3. 已装旧版的用户，也可以直接在 App 内「设置 → 检查更新」升级'
  ].join('\n');

  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tk}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tag_name: tag,
      name: `日历 ${ver}`,
      body,
      draft: false,
      prerelease: false
    })
  });

  if (!res.ok) {
    fail(`创建 Release 失败：${res.status} ${await res.text()}`);
  }
  const release = await res.json();

  // 5) 上传 APK
  const fileName = `calendar-${tag}.apk`;
  console.log(`› 上传 ${fileName}（${(fs.statSync(apkPath).size / 1048576).toFixed(2)} MB）`);
  const buf = fs.readFileSync(apkPath);
  const up = await fetch(
    `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(fileName)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tk}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': String(buf.length)
      },
      body: buf
    }
  );

  if (!up.ok) {
    fail(`上传 APK 失败：${up.status} ${await up.text()}`);
  }

  console.log(`\n✓ 发布完成：${tag}`);
  console.log(`  ${release.html_url}`);
  console.log('  手机上打开 App → 设置 → 检查更新，即可看到新版本。');
}

main().catch(e => fail(e.message || String(e)));
