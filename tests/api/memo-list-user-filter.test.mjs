import assert from 'node:assert/strict';
import worker from '../../worker/src/index.js';

/**
 * /api/memo/list 的用户过滤契约：
 * - `username` 是主参数；`user` 是 API.md 历史文档与旧客户端使用的兼容别名，二者必须等价
 * - 过滤条件同时作用于 total 计数查询与列表查询（分页一致性）
 * - 两者都为空时不产生 `u.username` 条件（不能把空串当用户名查）
 * 这里用记录型 D1 mock 断言实际下发的 SQL 与绑定参数，不依赖真实数据库。
 */
const queries = [];
const record = (sql) => {
  const statement = {
    sql,
    args: [],
    bind(...args) { statement.args = args; return statement; },
    async first() { if (sql.includes('COUNT(*)')) return { total: 3 }; return null; },
    async all() { return { results: [] }; },
    async run() { return { meta: { changes: 1 } }; },
  };
  queries.push(statement);
  return statement;
};
const env = {
  DB: { prepare(sql) { return record(sql); } },
  JWT_SECRET: 'memo-list-user-filter-secret-at-least-32-chars',
};
const list = async body => await (await worker.fetch(new Request('https://moments.example/api/memo/list', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}), env)).json();

const memoQueries = () => queries.filter(item => item.sql.includes('FROM memos m JOIN users u'));
const usernameQueries = () => memoQueries().filter(item => item.sql.includes('u.username = ?'));
const run = async (body) => { queries.length = 0; return await list(body); };

// 1) `user` 别名生效：计数与列表查询都带上用户名条件
let body = await run({ user: 'alice' });
assert.equal(body.code, 0);
assert.equal(usernameQueries().length, 2, 'total 与列表查询都应带 u.username 条件');
for (const item of usernameQueries()) assert.ok(item.args.includes('alice'), `缺少 alice 绑定：${item.sql}`);

// 2) `username` 主参数与 `user` 别名完全等价
const aliasArgs = usernameQueries().map(item => item.args.join(','));
body = await run({ username: 'alice' });
assert.equal(body.code, 0);
assert.deepEqual(usernameQueries().map(item => item.args.join(',')), aliasArgs, 'user 与 username 必须产生相同绑定');

// 3) 同时传入时以 username 为准（别名只是兜底）
body = await run({ username: 'bob', user: 'alice' });
assert.equal(body.code, 0);
const preferred = usernameQueries();
assert.equal(preferred.length, 2);
for (const item of preferred) {
  assert.ok(item.args.includes('bob'), 'username 应优先');
  assert.ok(!item.args.includes('alice'), '别名不得覆盖 username');
}

// 4) 都不传时不得产生用户名条件
body = await run({ page: 2, size: 5 });
assert.equal(body.code, 0);
assert.equal(usernameQueries().length, 0, '未传用户名参数时不应过滤用户');

// 5) 空串/空值不当作用户名（回归：documented `user` 传空不能让列表空转）
body = await run({ user: '', username: '' });
assert.equal(body.code, 0);
assert.equal(usernameQueries().length, 0, '空用户名参数应被忽略');

// 6) 过滤参数与分页参数共存：LIMIT/OFFSET 仍按 page/size 生效
body = await run({ user: 'alice', page: 3, size: 4 });
assert.equal(body.code, 0);
const listQuery = usernameQueries().find(item => item.sql.includes('LIMIT ? OFFSET ?'));
assert.ok(listQuery, '列表查询应带 LIMIT/OFFSET');
assert.deepEqual(listQuery.args.slice(-2), [4, 8], 'LIMIT=size、OFFSET=(page-1)*size');
assert.equal(body.data.total, 3);
assert.equal(body.data.hasNext, false);

console.log('Memo list user filter tests: PASS');
