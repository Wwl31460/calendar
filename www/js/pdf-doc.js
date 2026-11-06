/* ---------- 课表 PDF 原文件存储（IndexedDB，可离线随时查看） ---------- */
import { db, persist } from './store.js';

const DB_NAME = 'calapp-files';
const STORE = 'files';
const KEY = 'timetable-pdf';

let dbp = null;

function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('无法打开本地存储'));
  });
  return dbp;
}

function tx(mode) {
  return openDb().then(d => d.transaction(STORE, mode).objectStore(STORE));
}

const wrap = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/** 当前保存的 PDF 元信息（来自 settings，可同步读取） */
export function pdfMeta() {
  return db.settings.timetablePdf && db.settings.timetablePdf.name ? db.settings.timetablePdf : null;
}

/** 保存一份 PDF（覆盖旧文件） */
export async function savePdfFile(file) {
  const blob = file.slice ? file.slice(0, file.size, 'application/pdf') : file;
  const store = await tx('readwrite');
  await wrap(store.put({ blob, name: file.name, size: file.size, savedAt: Date.now() }, KEY));

  const meta = {
    name: file.name || '课表.pdf',
    size: file.size,
    savedAt: Date.now()
  };
  db.settings.timetablePdf = meta;
  persist();
  return meta;
}

/** 读取 PDF 二进制内容 */
export async function loadPdfFile() {
  const store = await tx('readonly');
  const rec = await wrap(store.get(KEY));
  if (!rec || !rec.blob) return null;
  const data = await rec.blob.arrayBuffer();
  return { data, name: rec.name, size: rec.size, savedAt: rec.savedAt };
}

/** 删除 */
export async function removePdfFile() {
  const store = await tx('readwrite');
  await wrap(store.delete(KEY));
  delete db.settings.timetablePdf;
  persist();
}

/** 是否可用的 IndexedDB */
export function storageReady() {
  try { return typeof indexedDB !== 'undefined'; } catch (e) { return false; }
}
