import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function overflows(scrollHeight, maxHeight) {
  return Number(maxHeight) > 0 && Number(scrollHeight) > Number(maxHeight) + 1;
}
assert.equal(overflows(80, 300), false, 'short content must not show collapse control');
assert.equal(overflows(300, 300), false, 'equal height must not show collapse control');
assert.equal(overflows(301, 300), false, 'one pixel layout rounding must not show collapse control');
assert.equal(overflows(302, 300), true, 'actual overflow must show collapse control');
assert.equal(overflows(2000, 0), false, 'disabled max height must not show collapse control');

const memo = await readFile(new URL('../front/components/Memo.vue', import.meta.url), 'utf8');
assert.match(memo, /element\.scrollHeight > maxHeight \+ 1/);
assert.match(memo, /ResizeObserver/);
assert.match(memo, /showMoreClicked \? "收起" : "全文"/);
assert.doesNotMatch(memo, /getMemoMaxHeightStyle\(\) === "" \? "收起"/);

const worker = await readFile(new URL('../worker/src/index.js', import.meta.url), 'utf8');
assert.match(worker, /service: 'moments-cf', phase: 7/);
console.log('Memo collapse regression tests: PASS');
