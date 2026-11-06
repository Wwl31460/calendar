/* ---------- 日志图片：压缩后存 IndexedDB ---------- */
import { storageReady, store, wrap } from './idb.js';
import { uid } from './utils.js';

const STORE = 'media';

/** 把手机相册里的图片压到合适尺寸，避免占满存储 */
export function fileToImageData(file, maxSide = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith('image/')) {
      reject(new Error('不是图片文件'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width: w, height: h } = img;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        w = Math.round(w * scale);
        h = Math.round(h * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        URL.revokeObjectURL(url);
        resolve({ dataUrl, w, h });
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片无法读取（可能是 HEIC 等特殊格式）'));
    };
    img.src = url;
  });
}

/** 保存一张图片，返回 { id, w, h } */
export async function saveImage(file) {
  if (!storageReady()) throw new Error('当前环境不支持本地图片存储');
  const { dataUrl, w, h } = await fileToImageData(file);
  const id = uid('img_');
  const s = await store(STORE, 'readwrite');
  await wrap(s.put({ dataUrl, w, h, size: file.size, createdAt: Date.now() }, id));
  return { id, w, h };
}

/** 批量保存 */
export async function saveImages(files) {
  const out = [];
  for (const f of files) {
    try {
      out.push(await saveImage(f));
    } catch (e) {
      console.warn('图片保存失败', f && f.name, e);
    }
  }
  return out;
}

export async function loadImage(id) {
  const s = await store(STORE);
  const rec = await wrap(s.get(id));
  return rec ? rec.dataUrl : null;
}

export async function deleteImage(id) {
  if (!id) return;
  const s = await store(STORE, 'readwrite');
  await wrap(s.delete(id));
}

export async function deleteImages(ids) {
  for (const id of ids || []) {
    try { await deleteImage(id); } catch (e) { /* ignore */ }
  }
}
