import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

/**
 * 图标名契约：front 源码里出现的每个 `i-<collection>-<name>` 都必须真实存在于对应图标集。
 *
 * 为什么需要：@nuxt/icon 对不存在的名字不会报错，只是渲染成空白——2026-10-06 用户就撞上
 * `i-carbon-smile` / `i-carbon-mail` / `i-carbon-heart` / `i-carbon-user-check` 四个名字
 * 在 Carbon 里根本不存在（正确名是 face-satisfied / email / favorite / user-certification）。
 *
 * 数据源是 front/node_modules 里已安装的 @iconify-json 集合；CI 的 worker-check job 不装
 * front 依赖，此时打印 SKIP 并以 0 退出（与 self-check 在缺 python3 时的处理一致）。
 */
const frontRoot = new URL('../../front/', import.meta.url);

// 1) 收集已安装集合：只读 .pnpm 的一层目录名，避免递归整个 node_modules（本机会慢到分钟级）
const sets = new Map();
try {
  for (const dir of await readdir(new URL('node_modules/.pnpm/', frontRoot))) {
    if (!dir.startsWith('@iconify-json+')) continue;
    const set = dir.slice('@iconify-json+'.length).split('@')[0];
    const raw = JSON.parse(await readFile(new URL(`node_modules/.pnpm/${dir}/node_modules/@iconify-json/${set}/icons.json`, frontRoot), 'utf8'));
    sets.set(set, new Set([...Object.keys(raw.icons || {}), ...Object.keys(raw.aliases || {})]));
  }
} catch { /* 未安装时按 SKIP 处理 */ }

if (!sets.size) {
  console.log('icon-names: SKIP（front/node_modules 未安装 @iconify-json 集合）');
} else {
  // 2) 遍历 front 源码（跳过依赖与构建产物）
  const skipDirs = new Set(['node_modules', '.output', '.nuxt', 'dist', 'coverage']);
  const files = [];
  const walk = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!skipDirs.has(entry.name)) await walk(new URL(`${entry.name}/`, dir)); continue; }
      if (/\.(vue|ts|js)$/.test(entry.name)) files.push(new URL(entry.name, dir));
    }
  };
  await walk(frontRoot);

  // 3) 提取并校验（集合名可能含连字符，按最长前缀匹配）
  const collections = [...sets.keys()].sort((a, b) => b.length - a.length);
  const invalid = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const found = new Set([
      ...[...source.matchAll(/['"`](i-[a-z0-9-]+)['"`]/g)].map(m => m[1]),
      ...[...source.matchAll(/(?:name|icon)="(i-[a-z0-9-]+)"/g)].map(m => m[1]),
    ]);
    for (const icon of found) {
      const body = icon.slice(2);
      const collection = collections.find(name => body.startsWith(`${name}-`));
      const short = collection ? body.slice(collection.length + 1) : null;
      if (!collection || !sets.get(collection).has(short)) {
        invalid.push(`${icon}（${file.pathname.split('/front/')[1]}）`);
      }
    }
  }
  assert.deepEqual(invalid, [], `存在图标集中不存在的图标名（会被渲染成空白）：\n  ${invalid.join('\n  ')}`);
  console.log('icon-names: PASS');
}
