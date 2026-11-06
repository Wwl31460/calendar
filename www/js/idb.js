/* ---------- 统一的 IndexedDB 入口 ---------- */
/* 课表原文件（files）与日志图片（media）共用一个库，避免多版本互相顶掉 */

const DB_NAME = 'calapp-files';
const VERSION = 2;

let dbp = null;

export function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');
      if (!d.objectStoreNames.contains('media')) d.createObjectStore('media');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('无法打开本地存储'));
  });
  return dbp;
}

export function store(name, mode = 'readonly') {
  return openDb().then(d => d.transaction(name, mode).objectStore(name));
}

export const wrap = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export function storageReady() {
  try { return typeof indexedDB !== 'undefined'; } catch (e) { return false; }
}
