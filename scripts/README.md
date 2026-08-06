# Cloudflare Bootstrap

`cloudflare-bootstrap.mjs` creates or reuses the Cloudflare resources required by Moments-CF without committing account-specific IDs to Git.

## Safe default

```bash
CLOUDFLARE_ACCOUNT_ID="your-account-id" \
CLOUDFLARE_API_TOKEN="your-minimum-permission-token" \
node scripts/cloudflare-bootstrap.mjs --resources-only
```

It creates/reuses D1 `moments-db` and R2 `moments-media`, then generates these ignored local files:

```text
worker/wrangler.local.toml
.moments-cf-bootstrap.json
```

It never uploads application secrets.

## Optional full CLI deployment

```bash
CLOUDFLARE_ACCOUNT_ID="your-account-id" \
CLOUDFLARE_API_TOKEN="your-token-with-deploy-permission" \
node scripts/cloudflare-bootstrap.mjs --deploy
```

`--deploy` runs all D1 migrations against the generated config and deploys Worker code. It is intentionally opt-in.

## Required API Token permissions

- `D1 Write`
- `Workers R2 Storage Write`
- plus `Workers Scripts Edit` only when using `--deploy`

## Secrets remain manual

Configure `JWT_SECRET` and `INIT_SECRET` as encrypted Worker secrets after bootstrap. Do not put them in Git, command history, or bootstrap state files.
