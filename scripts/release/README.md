# Release checks

Local preflight (read-only; validates generic Wrangler config and the exact `0001`–`0004` migration sequence):

```bash
node scripts/release/preflight.mjs
```

Deployed Worker smoke test (read-only; no login and no writes):

```bash
MOMENTS_BASE_URL=https://your-worker.workers.dev node scripts/release/smoke-test.mjs
```
