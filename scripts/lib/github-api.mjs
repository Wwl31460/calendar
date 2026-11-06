/**
 * GitHub REST API 封装（带重试、可选代理）。
 *
 * 代理从环境变量读取：HTTPS_PROXY / https_proxy / GH_PROXY，
 * 需要 undici 才能生效；未安装 undici 时自动直连。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let dispatcher = null;
let fetchImpl = globalThis.fetch;
let ready = false;

/** Node 内置 fetch 不支持 dispatcher 选项，有代理时改用 undici 的 fetch */
async function init() {
  if (ready) return;
  ready = true;
  const proxy = process.env.GH_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy
    || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!proxy) return;
  try {
    const u = await import('undici');
    dispatcher = new u.ProxyAgent(proxy);
    fetchImpl = u.fetch;
    console.log(`› 已启用代理 ${proxy}`);
  } catch {
    console.warn('› 检测到代理变量但未安装 undici，将尝试直连');
  }
}

export function getToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  const f = path.join(ROOT, '.github-token');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  return '';
}

export async function gh(method, apiPath, payload, { token, raw = false, retries = 3 } = {}) {
  const tk = token || getToken();
  if (!tk) throw new Error('未找到 GitHub Token');
  const url = apiPath.startsWith('http') ? apiPath : `https://api.github.com${apiPath}`;
  const headers = {
    Authorization: `Bearer ${tk}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'calendar-app-release'
  };
  let body;
  if (raw) {
    headers['Content-Type'] = 'application/vnd.android.package-archive';
    body = payload;
  } else if (payload !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(payload);
  }

  await init();
  let lastErr = '';
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetchImpl(url, { method, headers, body, dispatcher: dispatcher || undefined });
      const text = await res.text();
      if (!res.ok) {
        if (res.status === 404) return { ok: false, status: 404, data: null, text };
        lastErr = `${res.status} ${text.slice(0, 300)}`;
        if (res.status === 401 || res.status === 403) throw new Error(`认证失败（${res.status}）：Token 无权限或已失效`);
        if (res.status === 422) return { ok: false, status: 422, data: null, text };
      } else {
        return { ok: true, status: res.status, data: text ? JSON.parse(text) : null, text };
      }
    } catch (e) {
      if (/认证失败/.test(e.message)) throw e;
      lastErr = e.message;
    }
    await new Promise(r => setTimeout(r, 1200 * (i + 1)));
  }
  throw new Error(`${method} ${apiPath} 失败：${lastErr}`);
}
