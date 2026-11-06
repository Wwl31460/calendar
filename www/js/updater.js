/* ---------- 版本与在线更新 ---------- */
import { $, h, icon, openSheet, toast } from './ui.js';
import { esc } from './utils.js';

/* 版本号：由 scripts/bump.mjs 统一维护，同时写入 android/app/build.gradle */
export const APP_VERSION = '1.1.3';
export const VERSION_CODE = 5;

export const REPO = 'Wwl31460/calendar';
export const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

const CHECK_KEY = 'calapp.update.checkedAt';
const SKIP_KEY = 'calapp.update.skip';
const DAY = 24 * 3600 * 1000;

export function nativeUpdater() {
  try {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppUpdater) || null;
  } catch (e) { return null; }
}

export const isNativeApp = () => !!nativeUpdater();

/** 当前版本：原生环境读真实包信息，网页用常量 */
export async function currentVersion() {
  const P = nativeUpdater();
  if (P && P.getInfo) {
    try {
      const info = await P.getInfo();
      if (info && info.versionName) return { version: info.versionName, code: Number(info.versionCode) || 0 };
    } catch (e) { /* 回退到常量 */ }
  }
  return { version: APP_VERSION, code: VERSION_CODE };
}

/** 语义化版本比较：a>b 返回 1，相等 0，小于 -1 */
export function compareVersion(a, b) {
  const pa = String(a || '0').replace(/^v/i, '').split(/[.+-]/).map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').replace(/^v/i, '').split(/[.+-]/).map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** 拉取 GitHub 上最新 Release */
export async function fetchLatest() {
  const res = await fetch(`${RELEASES_API}?t=${Date.now()}`, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store'
  });
  if (res.status === 404) throw new Error('仓库还没有发布任何版本');
  if (res.status === 403) throw new Error('请求过于频繁，请稍后再试');
  if (!res.ok) throw new Error(`网络错误 ${res.status}`);
  const data = await res.json();
  const assets = (data.assets || []).filter(a => /\.apk$/i.test(a.name));
  const apk = assets.sort((a, b) => b.size - a.size)[0] || null;
  return {
    version: String(data.tag_name || data.name || '').replace(/^v/i, ''),
    tag: data.tag_name || '',
    name: data.name || '',
    notes: data.body || '',
    publishedAt: data.published_at || '',
    page: data.html_url || RELEASES_PAGE,
    apk: apk ? { name: apk.name, url: apk.browser_download_url, size: apk.size } : null
  };
}

/** 检查更新，返回 { ok, latest, hasUpdate, ... } */
export async function check() {
  const cur = await currentVersion();
  const latest = await fetchLatest();
  const hasUpdate = latest.version ? compareVersion(latest.version, cur.version) > 0 : false;
  return { ok: true, current: cur, latest, hasUpdate };
}

export function markChecked() {
  try { localStorage.setItem(CHECK_KEY, String(Date.now())); } catch (e) { /* ignore */ }
}
export function lastCheckedAt() {
  const v = Number(localStorage.getItem(CHECK_KEY) || 0);
  return v || 0;
}
export function shouldAutoCheck() {
  return Date.now() - lastCheckedAt() > DAY;
}

/** 启动时静默检查，有新版本提示一次 */
export async function autoCheck() {
  if (!shouldAutoCheck()) return null;
  try {
    const r = await check();
    markChecked();
    if (!r.hasUpdate) return null;
    const skipped = localStorage.getItem(SKIP_KEY);
    if (skipped === r.latest.version) return null;
    setTimeout(() => promptUpdate(r), 1200);
    return r;
  } catch (e) {
    return null;
  }
}

export function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- 更新弹层 ---------- */
export function promptUpdate(result) {
  const { latest, current } = result;
  const native = isNativeApp();
  const canInstall = !!latest.apk;

  const notes = (latest.notes || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !/^#{1,6}\s*$/.test(line))
    .map(line => esc(line.replace(/^#{1,6}\s*/, '').replace(/^[-*]\s*/, '· ')))
    .slice(0, 14)
    .join('<br>');

  const body = h(`<div class="upd">
    <div class="upd-hero">
      <div class="upd-badge">${icon('download', 'ico')}</div>
      <div class="upd-hero-txt">
        <b>发现新版本 ${esc(latest.version)}</b>
        <span>当前 ${esc(current.version)}${latest.publishedAt ? ' · ' + fmtDate(latest.publishedAt) : ''}</span>
      </div>
    </div>
    ${notes ? `<div class="upd-notes">${notes}</div>` : ''}
    ${canInstall ? `<div class="upd-file">
        ${icon('file', 'ico')}
        <div class="grow">${esc(latest.apk.name)}</div>
        <span class="val">${fmtSize(latest.apk.size)}</span>
      </div>` : `<p class="hint">该版本未附带 APK 安装包。</p>`}
    <div class="upd-progress" id="upd-progress" hidden>
      <div class="upd-bar"><i id="upd-bar"></i></div>
      <span id="upd-pct">0%</span>
    </div>
    ${native ? '' : `<p class="hint">网页版无法自动安装，点击「去下载」后请用浏览器下载并安装。</p>`}
  </div>`);

  const actions = [
    {
      text: native ? '稍后' : '稍后',
      variant: 'secondary',
      onClick: c => c()
    },
    {
      text: canInstall ? (native ? '立即更新' : '去下载') : '打开发布页',
      onClick: async (close) => {
        if (!canInstall) {
          window.open(latest.page, '_blank');
          close();
          return;
        }
        if (native) {
          close();
          await downloadAndInstall(latest.apk);
        } else {
          window.open(downloadCandidates(latest.apk.url, latest.apk.name)[0], '_blank');
          close();
        }
      }
    }
  ];

  openSheet({
    title: '',
    body,
    actions,
    onMount: (sheet) => {
      const head = sheet.querySelector('.sheet-head');
      if (head) head.remove();
      const skip = h('<button class="upd-skip">跳过此版本</button>');
      skip.addEventListener('click', () => {
        localStorage.setItem(SKIP_KEY, latest.version);
        sheet.querySelector('.sheet-mask').click();
        toast('已跳过该版本');
      });
      sheet.querySelector('.sheet-body').appendChild(skip);
    }
  });
}

/* 国内直连 github.com 的 Release 下载常被阻断（实测 19s 超时），因此镜像优先、官方兜底。
   实测这些镜像会返回「200 + 半截文件」，所以原生侧下载后必须校验大小与包结构，
   不通过就换下一个源。 */
export const MIRRORS = ['https://ghfast.top/', 'https://gh-proxy.com/', ''];

export function downloadCandidates(url) {
  const list = [];
  MIRRORS.forEach(prefix => {
    const u = prefix ? prefix + url : url;
    if (!list.includes(u)) list.push(u);
  });
  return list;
}

/** 下载或安装失败时让用户自己用浏览器重来一遍，比反复重试更靠谱 */
function offerManualDownload(apk, reason, opts) {
  const o = opts || {};
  openSheet({
    title: o.title || '下载失败',
    body: `<div class="upd">
      <div class="upd-badge warn">${icon('warn', 'ico')}</div>
      <b style="font-size:14.5px">${esc(o.heading || '安装包没有下载完整')}</b>
      <p class="hint" style="margin-top:8px;line-height:1.7">${esc(reason || '网络中断，文件没下全')}<br>
      ${esc(o.advice || '已自动换过多个下载源仍未成功，建议改用浏览器下载同名安装包。')}</p>
      <div class="upd-file">
        ${icon('file', 'ico')}
        <div class="grow">${esc(apk.name || 'calendar.apk')}</div>
        <span class="val">${fmtSize(apk.size)}</span>
      </div>
      <p class="hint" style="margin-top:10px">下载完成后请确认文件大小是 <b>${apk.size ? apk.size.toLocaleString('en-US') + ' 字节' : '与服务端一致'}</b>，再点击安装。</p>
    </div>`,
    actions: [
      { text: '关闭', variant: 'secondary', onClick: c => c() },
      {
        text: '用浏览器下载',
        onClick: c => {
          c();
          window.open(downloadCandidates(apk.url, apk.name)[0], '_blank');
        }
      }
    ]
  });
}

/** 原生下载并调起安装器 */
async function downloadAndInstall(apk) {
  const url = apk.url;
  const P = nativeUpdater();
  if (!P) { window.open(downloadCandidates(url, apk.name)[0] || url, '_blank'); return; }

  const bar = h(`<div class="sheet" style="z-index:9999">
    <div class="sheet-mask"></div>
    <div class="sheet-panel">
      <div class="sheet-grip"></div>
      <div class="sheet-body">
        <div class="upd-downloading">
          <div class="upd-spin">${icon('download', 'ico')}</div>
          <b>正在下载更新</b>
          <span id="dl-pct">0%</span>
          <div class="upd-bar"><i id="dl-bar"></i></div>
          <p class="hint">请保持 App 在前台，下载完成后会自动弹出安装</p>
        </div>
      </div>
    </div>
  </div>`);
  $('#sheet-root').appendChild(bar);

  const setPct = (pct) => {
    const b = bar.querySelector('#dl-bar');
    const t = bar.querySelector('#dl-pct');
    if (b) b.style.width = `${pct}%`;
    if (t) t.textContent = `${pct}%`;
  };

  let sub = null;
  try {
    sub = await P.addListener('downloadProgress', d => {
      setPct(Math.max(0, Math.min(100, Math.round((d.progress || 0) * 100))));
    });
  } catch (e) { /* 忽略 */ }

  try {
    await P.addListener('installPermissionNeeded', () => {
      bar.remove();
      toast('请允许「安装未知应用」后再次点击更新', 4000);
    });
    await P.addListener('installStarted', () => {
      bar.remove();
    });
    // 系统安装会话的结果：确认 / 成功 / 失败
    await P.addListener('installResult', d => {
      const kind = (d && d.kind) || '';
      const msg = (d && d.message) || '';
      if (kind === 'success') {
        bar.remove();
        toast('安装完成', 2500);
        return;
      }
      if (kind === 'confirm') {
        bar.remove();
        toast(msg || '请在系统窗口中确认安装', 3500);
        return;
      }
      bar.remove();
      if (sub) sub.remove && sub.remove();
      offerManualDownload(apk, msg || '系统未能完成安装', {
        title: '安装没有完成',
        heading: '系统拦截了这次安装',
        advice: '可以把安装包交给浏览器下载后手动安装，或关闭手机的「纯净模式 / 安全守护」再试一次。'
      });
    });
    await P.addListener('downloadError', d => {
      bar.remove();
      if (sub) sub.remove && sub.remove();
      offerManualDownload(apk, (d && d.message) || '');
    });
  } catch (e) { /* 忽略 */ }

  try {
    const info = await P.canInstall();
    if (info && info.value === false) {
      bar.remove();
      const ok = await new Promise(resolve => {
        openSheet({
          title: '需要安装权限',
          body: `<p style="font-size:13.5px;color:var(--text-2);line-height:1.75;margin:0 0 6px">
            系统需要你允许「日历」安装应用，才能完成自动更新。<br>
            请在接下来的页面中打开开关，然后返回重试。</p>`,
          actions: [
            { text: '取消', variant: 'secondary', onClick: c => { c(); resolve(false); } },
            { text: '去开启', onClick: c => { c(); resolve(true); } }
          ]
        });
      });
      if (ok) await P.openInstallPermission();
      return;
    }

    setPct(2);
    await P.downloadAndInstall({
      urls: downloadCandidates(url, apk.name),
      url,
      fileName: apk.name || 'calendar-update.apk',
      expectSize: apk.size || 0
    });
  } catch (e) {
    bar.remove();
    if (sub) sub.remove && sub.remove();
    toast('更新失败，请稍后再试');
  }
}

/* ---------- 设置页「检查更新」 ---------- */
export async function openCheckSheet() {
  const body = h(`<div class="upd">
    <div class="upd-checking" id="upd-checking">
      <div class="upd-spin">${icon('repeat', 'ico')}</div>
      <span>正在检查…</span>
    </div>
  </div>`);
  let closeFn = null;
  openSheet({
    title: '检查更新',
    body,
    actions: [{ text: '关闭', variant: 'secondary', onClick: c => c() }],
    onMount: (el, close) => { closeFn = close; }
  });

  const box = body.querySelector('#upd-checking');
  const cur = await currentVersion();
  try {
    const r = await check();
    markChecked();
    if (!r.hasUpdate) {
      box.innerHTML = `
        <div class="upd-badge ok">${icon('check', 'ico')}</div>
        <b style="font-size:14.5px">已是最新版本</b>
        <span style="font-size:12.5px;color:var(--text-3)">当前 v${esc(cur.version)}</span>`;
      return;
    }
    if (closeFn) closeFn();
    promptUpdate(r);
  } catch (e) {
    box.innerHTML = `
      <div class="upd-badge warn">${icon('warn', 'ico')}</div>
      <b style="font-size:14px">检查失败</b>
      <span style="font-size:12.5px;color:var(--text-3);line-height:1.6">${esc(e.message || '网络不可用')}</span>
      <a class="upd-link" href="${RELEASES_PAGE}" target="_blank">打开发布页 →</a>`;
  }
}
