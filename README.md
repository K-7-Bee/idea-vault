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

## Environment variables

| Name | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your Supabase publishable (anon) key |
| `ALLOWED_EMAIL` | The only email allowed into `/vault` |

## Database

Run the SQL files in `supabase/` in the Supabase SQL editor, in order: `schema.sql`, `002_tags.sql`, `003_files.sql`.

## Deploy

Deploy anywhere that runs Next.js, such as Vercel. Set the three environment variables above in the host's project settings.
