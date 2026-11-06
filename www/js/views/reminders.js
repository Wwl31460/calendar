/* ---------- 提醒列表视图 ---------- */
import { db, updateReminder } from '../store.js';
import { esc, pad2 } from '../utils.js';
import { $, emptyState, icon, toast } from '../ui.js';
import { openReminderForm } from '../forms.js';
import { ensurePermission, missed, nextOccurrence, permissionState, relativeTo, repeatLabel } from '../reminder.js';

function card(r, now) {
  const next = r.enabled ? nextOccurrence(r, now) : null;
  const when = next ? relativeTo(next, now) : '';
  const urgent = next && (next - now) < 3600 * 1000 && (next - now) >= 0;
  const metaBits = [repeatLabel(r)];
  if (r.note) metaBits.push(r.note);

  return `
    <div class="rem-card ${r.enabled ? '' : 'off'}" data-id="${r.id}">
      <div class="rem-main">
        <div class="rem-title"><span class="dotmark" style="background:${r.repeat === 'none' ? 'var(--primary)' : 'var(--amber)'}"></span>${esc(r.title)}</div>
        <div class="rem-meta">${metaBits.map(esc).join(' · ')}</div>
        ${when ? `<div class="rem-when ${urgent ? 'urgent' : ''}">${icon('clock')}${esc(when)}</div>` : '<div class="rem-when" style="color:var(--text-3)">已过期</div>'}
      </div>
      <label class="switch" data-switch="${r.id}">
        <input type="checkbox" ${r.enabled ? 'checked' : ''} />
        <i></i>
      </label>
    </div>`;
}

export function render() {
  const now = new Date();
  const enabled = db.reminders.filter(r => r.enabled)
    .map(r => ({ r, next: nextOccurrence(r, now) }))
    .sort((a, b) => (a.next ? a.next.getTime() : Infinity) - (b.next ? b.next.getTime() : Infinity));
  const disabled = db.reminders.filter(r => !r.enabled);

  $('#rem-sub').textContent = db.reminders.length
    ? `${enabled.length} 个进行中${disabled.length ? ` · ${disabled.length} 个已关闭` : ''}`
    : '暂无提醒';

  let html = '';

  const perm = permissionState();
  if (perm === 'denied') {
    html += `<div class="banner warn">${icon('warn')}<div>系统已禁止通知权限，提醒到点时可能不会弹出。请在浏览器/系统设置中允许本站通知。</div></div>`;
  } else if (perm === 'default' && enabled.length) {
    html += `<div class="banner" id="rem-perm">${icon('bell')}<div><b>开启通知权限</b>，到点才能收到系统弹窗提醒。<u style="cursor:pointer">点此开启</u></div></div>`;
  }

  if (missed.length) {
    html += `<div class="banner warn">${icon('clock')}<div>有 ${missed.length} 条提醒在应用未打开时错过了：${esc(missed.map(m => m.reminder.title).slice(0, 3).join('、'))}</div></div>`;
  }

  if (!db.reminders.length) {
    html += emptyState('🔔', '还没有提醒，点击右上角 + 新建一个');
  } else {
    if (enabled.length) {
      html += `<div class="sec-title">${icon('bell')}进行中</div>` + enabled.map(x => card(x.r, now)).join('');
    }
    if (disabled.length) {
      html += `<div class="sec-title">${icon('repeat')}已关闭</div>` + disabled.map(r => card(r, now)).join('');
    }
  }

  const list = $('#rem-list');
  list.innerHTML = html;

  const permBanner = $('#rem-perm');
  if (permBanner) {
    permBanner.addEventListener('click', async () => {
      const res = await ensurePermission();
      if (res === 'granted') toast('通知已开启');
      else toast('未获得通知权限');
      render();
    });
  }

  list.querySelectorAll('[data-switch]').forEach(el => {
    el.addEventListener('click', e => e.stopPropagation());
    el.querySelector('input').addEventListener('change', e => {
      updateReminder(el.dataset.switch, { enabled: e.target.checked });
      toast(e.target.checked ? '已开启提醒' : '已关闭提醒');
      render();
    });
  });

  list.querySelectorAll('.rem-card').forEach(el => {
    el.addEventListener('click', () => {
      const r = db.reminders.find(x => x.id === el.dataset.id);
      if (r) openReminderForm({ reminder: r });
    });
  });
}

export function bind() {
  $('#rem-add').addEventListener('click', () => openReminderForm({ date: new Date().toISOString().slice(0, 10) }));
}
