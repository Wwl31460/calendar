/**
 * 删除一个 Release 及其 tag（用于重发同一版本号）。
 *   node scripts/delete-release.mjs v1.4.0
 */
import { gh } from './lib/github-api.mjs';

const OWNER = 'Wwl31460';
const REPO = 'calendar';
const tag = process.argv[2];
if (!tag) { console.error('用法：node scripts/delete-release.mjs v1.4.0'); process.exit(1); }

const found = await gh('GET', `/repos/${OWNER}/${REPO}/releases/tags/${tag}`);
if (found.ok && found.data) {
  const del = await gh('DELETE', `/repos/${OWNER}/${REPO}/releases/${found.data.id}`);
  console.log(del.ok ? `› 已删除 Release ${tag}（id=${found.data.id}）` : `✗ 删除 Release 失败 ${del.status}`);
} else {
  console.log(`› 没有找到 Release ${tag}`);
}

const ref = await gh('DELETE', `/repos/${OWNER}/${REPO}/git/refs/tags/${tag}`);
console.log(ref.ok ? `› 已删除 tag ${tag}` : `› tag ${tag} 不存在或已删除`);
