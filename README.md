# RENESSANS Backend

Express + TypeScript API with Prisma ORM. PostgreSQL (Neon in production) is the supported database provider. SQLite `dev.db` files are not used by the PostgreSQL deployment.

## Local development

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` and `DIRECT_URL` to your local PostgreSQL connection URL. For local PostgreSQL, SSL is not required (the same URL can be used for both).
3. Generate a random secret of at least 32 characters for `JWT_SECRET`.
4. Set `FRONTEND_URL=http://localhost:3000,http://localhost:5173` (comma-separated origins are supported).
5. Install and start:

```bash
npm ci
npm run build
npm run prisma:migrate:deploy
npm run dev
```

`npm run dev` uses `ts-node-dev`; `npm start` starts the compiled production server. The API listens on `0.0.0.0` and uses `PORT` (default `5000`). Health check: `GET /health`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Runtime PostgreSQL URL. Use Neon’s pooled URL with `sslmode=require&pgbouncer=true&connection_limit=5&pool_timeout=10&connect_timeout=15`. |
| `DIRECT_URL` | Yes | Direct PostgreSQL URL for Prisma migrations (Neon direct, non-pooler endpoint). Use `sslmode=require&connection_limit=1&connect_timeout=15`. |
| `JWT_SECRET` | Yes | Random secret, at least 32 characters. Never commit it. |
| `NODE_ENV` | No | `production` on Render; enables PostgreSQL SSL validation. |
| `PORT` | No | HTTP port supplied by Render; defaults to `5000` locally. |
| `FRONTEND_URL` | No | Comma-separated allowed browser origins, e.g. the Vercel deployment URL and local frontend origins (`http://localhost:3000,http://localhost:5173`). |

Authentication uses JWTs in the `Authorization` header; this API does not use cookies. CORS explicitly allows that header.

## Render deployment

Connect the backend repository (or set Render’s Root Directory to `backend` if deploying from the monorepo). The included `render.yaml` configures:

- **Root Directory:** `.` for a backend-only repository
- **Build Command:** `npm ci --include=dev && npm run build`
- **Start Command:** `npm run prisma:migrate:deploy && npm start`
- **Health Check Path:** `/health`

Set `DATABASE_URL` to Neon’s pooled PostgreSQL URL and `DIRECT_URL` to the Neon direct (non-pooled) endpoint. Both URLs must use SSL; use the conservative pool parameters above for `DATABASE_URL`. Also set `JWT_SECRET` to a fresh random 32+ character value, `FRONTEND_URL` to the exact Vercel origin(s), and `NODE_ENV=production`. Render supplies `PORT`.

The PostgreSQL baseline migration is applied by `prisma migrate deploy` at service start. It creates the schema on an empty Neon database. SQLite-only migration history is retained under `prisma/migrations_sqlite_archive/` and is not executed. If the Neon database already contains tables or data created outside Prisma migrations, do not deploy until the schema/data has been backed up and the migration history has been baselined appropriately; `migrate deploy` does not import the local SQLite database. Never use `prisma migrate dev` or `prisma db push` in production.

`npm run reset-and-seed` is a destructive development utility: it defaults to dry-run and requires explicit confirmation. It is not part of the Render build or start command. Production/Neon execution requires an additional `--confirm-production` flag.

## Security notes

- Keep `.env` and all deployment secrets out of Git.
- The legacy demo seed with known passwords was removed. Use the protected reset-and-seed script only when intentionally replacing development data.
- Rotate any JWT/database credentials that were previously committed or shared.
