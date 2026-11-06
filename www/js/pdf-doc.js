/* ---------- 课表原文件存储（PDF / 图片，IndexedDB，可离线随时查看） ---------- */
import { db, persist } from './store.js';
import { store, storageReady, wrap } from './idb.js';

const STORE = 'files';
const KEY = 'timetable-doc';

export { storageReady };

/** 当前保存的原文件元信息（可同步读取） */
export function docMeta() {
  const d = db.settings.timetableDoc;
  if (d && d.name) return d;
  // 兼容旧版本存过的 PDF
  const old = db.settings.timetablePdf;
  if (old && old.name) return { ...old, kind: 'pdf' };
  return null;
}

/** 判断文件类型 */
export function kindOf(file) {
  const name = (file && file.name) || '';
  if (/\.pdf$/i.test(name) || file.type === 'application/pdf') return 'pdf';
  if (/^image\//.test(file.type || '') || /\.(png|jpe?g|webp|bmp|gif|heic)$/i.test(name)) return 'image';
  return 'pdf';
}

/** 保存一份原文件（覆盖旧的） */
export async function saveDocFile(file) {
  const kind = kindOf(file);
  const type = file.type || (kind === 'pdf' ? 'application/pdf' : 'image/*');
  const blob = file.slice ? file.slice(0, file.size, type) : file;

  const s = await store(STORE, 'readwrite');
  await wrap(s.put({ blob, name: file.name || (kind === 'pdf' ? '课表.pdf' : '课表图片'), size: file.size, kind, savedAt: Date.now() }, KEY));

  const meta = {
    name: file.name || (kind === 'pdf' ? '课表.pdf' : '课表图片'),
    size: file.size,
    kind,
    savedAt: Date.now()
  };
  db.settings.timetableDoc = meta;
  delete db.settings.timetablePdf;
  persist();
  return meta;
}

/** 读取原文件：PDF 给 ArrayBuffer，图片给 Blob */
export async function loadDocFile() {
  const s = await store(STORE);
  const rec = await wrap(s.get(KEY));
  if (!rec || !rec.blob) return null;
  const kind = rec.kind || 'pdf';
  if (kind === 'pdf') {
    return { kind, name: rec.name, size: rec.size, savedAt: rec.savedAt, data: await rec.blob.arrayBuffer() };
  }
  return { kind, name: rec.name, size: rec.size, savedAt: rec.savedAt, blob: rec.blob };
}

/** 删除 */
export async function removeDocFile() {
  const s = await store(STORE, 'readwrite');
  await wrap(s.delete(KEY));
  delete db.settings.timetableDoc;
  delete db.settings.timetablePdf;
  persist();
}

/* ---- 旧接口别名（保留兼容） ---- */
export const pdfMeta = docMeta;
export const savePdfFile = saveDocFile;
export const removePdfFile = removeDocFile;
export const loadPdfFile = loadDocFile;
