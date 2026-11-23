# Idea Vault

MD Kaushik Kamal's personal site: a portfolio at `/` and a private, offline-capable idea vault at `/vault`.

- **Portfolio** (`src/app/page.tsx`, parts in `src/app/portfolio/`): an interactive hero, projects, an engineering lab (3D motor explorer and an Ohm's law simulator), BYTE the robot and a secret terminal (press `~`).
- **Vault** (`src/app/vault/`, login at `/login`): capture ideas with tags, photos, files and voice notes. It works offline and syncs when you're back online. Only one email address can log in.

Built with Next.js, Tailwind CSS, Supabase and three.js.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000.

## Settings, database, checks and deploy

See [docs/RUNBOOK.md](docs/RUNBOOK.md) for:
- every setting (`.env.example` lists them with short notes);
- the migration order;
- the checks (`npm test`, `npm run test:sql`, `npm run test:browser`; CI runs them all on every push);
- go-live and rollback;
- backups;
- what to do if something goes wrong.

The minimum to run locally is `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `ALLOWED_EMAIL`.
