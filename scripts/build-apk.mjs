#!/usr/bin/env node
/**
 * 一键打包：同步网页资源 → 编译签名 APK → 复制到 dist/
 *
 *   node scripts/build-apk.mjs
 *
 * 需要 JAVA_HOME 指向 JDK 17，ANDROID_HOME 指向 Android SDK。
 * 本机默认路径：E:\AndroidDev\jdk、E:\AndroidDev\sdk
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID = path.join(ROOT, 'android');
const isWin = process.platform === 'win32';

const env = { ...process.env };
env.JAVA_HOME = env.JAVA_HOME || 'E:\\AndroidDev\\jdk';
env.ANDROID_HOME = env.ANDROID_HOME || 'E:\\AndroidDev\\sdk';
env.ANDROID_SDK_ROOT = env.ANDROID_HOME;
env.PATH = `${env.JAVA_HOME}\\bin;${env.ANDROID_HOME}\\platform-tools;${env.PATH}`;

function run(cmd, args, cwd = ROOT) {
  console.log(`\n› ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) {
    console.error(`\n✗ 执行失败：${cmd} ${args.join(' ')}`);
    process.exit(r.status || 1);
  }
}

// 读取版本号
const match = fs.readFileSync(path.join(ROOT, 'www/js/updater.js'), 'utf8').match(/APP_VERSION\s*=\s*'([^']+)'/);
const version = match ? match[1] : '0.0.0';

// 1) 同步 web 资源到原生工程
//    默认只做 copy（网页资源 + 配置），插件有变化时加 --full 走完整 sync。
//    完整 sync 会清空 capacitor-cordova-android-plugins/build，某些环境的安全策略会拦截批量删除。
const full = process.argv.includes('--full');
run(isWin ? 'npx.cmd' : 'npx', full ? ['cap', 'sync', 'android'] : ['cap', 'copy', 'android']);

// 2) 编译
run(isWin ? 'gradlew.bat' : './gradlew', ['assembleRelease', '--console=plain'], ANDROID);

// 3) 输出
const outDir = path.join(ANDROID, 'app/build/outputs/apk/release');
const apk = fs.readdirSync(outDir).find(f => f.endsWith('.apk'));
if (!apk) {
  console.error('✗ 没有找到生成的 APK');
  process.exit(1);
}

const dist = path.join(ROOT, 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.readdirSync(dist).forEach(f => {
  if (f.endsWith('.apk')) fs.unlinkSync(path.join(dist, f));
});

const target = path.join(dist, `calendar-v${version}.apk`);
fs.copyFileSync(path.join(outDir, apk), target);

const mb = (fs.statSync(target).size / 1048576).toFixed(2);
console.log(`\n✓ 打包完成 v${version}（${mb} MB）`);
console.log(`  ${target}`);
console.log('\n下一步：把该文件上传到 GitHub Release，手机端的「检查更新」就能收到。');
