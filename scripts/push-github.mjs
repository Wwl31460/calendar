#!/usr/bin/env node
/**
 * 通过 GitHub REST API 推送代码（当 git push 被网络阻断时的替代通道）。
 *
 * 只上传与远端有差异的文件，日常发版通常只有几个文件。
 *
 *   node scripts/push-github.mjs
 *   node scripts/push-github.mjs --message "v1.0.1：修复xx"
 *
 * Token 来源：环境变量 GITHUB_TOKEN，或项目根目录 .github-token 文件。
 * 有代理时设置 HTTPS_PROXY 即可（需要 undici，已在 devDependencies）。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gh, getToken } from './lib/github-api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWNER = 'Wwl31460';
const REPO = 'calendar';
const BRANCH = 'main';

function git(args, opts = {}) {
  const r = spawnSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} 失败：${r.stderr?.toString().slice(0, 300)}`);
  }
  return r.stdout;
}

/** 本地 HEAD 的文件清单 { path: { mode, sha } } */
function localTree(rev = 'HEAD') {
  const out = [];
  for (const line of git(['ls-tree', '-r', '-z', rev]).toString().split('\0')) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    const [mode, type, sha] = line.slice(0, tab).split(' ');
    if (type !== 'blob') continue;
    out.push({ mode, sha, path: line.slice(tab + 1) });
  }
  return out;
}

function blobContent(sha) {
  return git(['cat-file', 'blob', sha]);
}

/**
 * 把当前 HEAD 推送到远端分支。
 * @returns {{sha: string, uploaded: number, deleted: number, skipped: boolean}}
 */
export async function pushViaApi({ message, token, owner = OWNER, repo = REPO, branch = BRANCH } = {}) {
  const tk = token || getToken();
  if (!tk) throw new Error('未找到 GitHub Token（设置 GITHUB_TOKEN 或创建 .github-token）');

  const msg = message || git(['log', '-1', '--format=%B']).toString().trim();
  const authorName = git(['log', '-1', '--format=%an']).toString().trim();
  const authorEmail = git(['log', '-1', '--format=%ae']).toString().trim();
  const authorDate = git(['log', '-1', '--format=%aI']).toString().trim();

  // 远端现状
  let remoteHead = null;
  let remoteTreeSha = null;
  const remoteFiles = new Map();

  const refRes = await gh('GET', `/repos/${owner}/${repo}/git/ref/heads/${branch}`, undefined, { token: tk });
  if (refRes.ok && refRes.data) {
    remoteHead = refRes.data.object.sha;
    const commitRes = await gh('GET', `/repos/${owner}/${repo}/git/commits/${remoteHead}`, undefined, { token: tk });
    remoteTreeSha = commitRes.data.tree.sha;
    const treeRes = await gh('GET', `/repos/${owner}/${repo}/git/trees/${remoteTreeSha}?recursive=1`, undefined, { token: tk });
    for (const item of treeRes.data.tree) {
      if (item.type === 'blob') remoteFiles.set(item.path, item.sha);
    }
    console.log(`› 远端 ${branch} 当前：${remoteHead.slice(0, 8)}（${remoteFiles.size} 个文件）`);
  } else {
    console.log('› 远端分支为空，将创建初始分支');
  }

  const local = localTree();
  const upload = [];
  for (const f of local) {
    if (remoteFiles.get(f.path) !== f.sha) upload.push(f);
  }
  const localPaths = new Set(local.map(f => f.path));
  const removed = [...remoteFiles.keys()].filter(p => !localPaths.has(p));

  console.log(`› 本地 ${local.length} 个文件，需要上传 ${upload.length} 个，删除 ${removed.length} 个`);
  if (!upload.length && !removed.length && remoteHead) {
    console.log('✓ 远端已是最新，无需推送');
    return { sha: remoteHead, uploaded: 0, deleted: 0, skipped: true };
  }

  // 上传 blob（并发 6）
  const entries = [];
  const queue = [...upload];
  let done = 0;
  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      const content = Buffer.from(blobContent(f.sha)).toString('base64');
      const res = await gh('POST', `/repos/${owner}/${repo}/git/blobs`, { content, encoding: 'base64' }, { token: tk });
      entries.push({ path: f.path, mode: f.mode, type: 'blob', sha: res.data.sha });
      done++;
      if (done % 20 === 0 || done === upload.length) console.log(`  blob ${done}/${upload.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, Math.max(1, upload.length)) }, worker));

  for (const p of removed) {
    entries.push({ path: p, mode: '100644', type: 'blob', sha: null });
  }

  // 建 tree / commit / 更新 ref
  const treePayload = { tree: entries };
  if (remoteTreeSha) treePayload.base_tree = remoteTreeSha;
  const treeRes = await gh('POST', `/repos/${owner}/${repo}/git/trees`, treePayload, { token: tk });

  const commitPayload = {
    message: msg,
    tree: treeRes.data.sha,
    author: { name: authorName, email: authorEmail, date: authorDate },
    committer: { name: authorName, email: authorEmail, date: authorDate },
    parents: remoteHead ? [remoteHead] : []
  };
  const commitRes = await gh('POST', `/repos/${owner}/${repo}/git/commits`, commitPayload, { token: tk });
  const newSha = commitRes.data.sha;

  if (remoteHead) {
    await gh('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${branch}`, { sha: newSha, force: true }, { token: tk });
  } else {
    await gh('POST', `/repos/${owner}/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: newSha }, { token: tk });
  }

  console.log(`✓ 已推送到 ${owner}/${repo}@${branch}：${newSha.slice(0, 8)}`);
  return { sha: newSha, uploaded: upload.length, deleted: removed.length, skipped: false };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/push-github.mjs');
if (isMain) {
  const idx = process.argv.indexOf('--message');
  const message = idx > -1 ? process.argv[idx + 1] : undefined;
  pushViaApi({ message }).catch(e => {
    console.error(`\n✗ ${e.message}`);
    process.exit(1);
  });
}
