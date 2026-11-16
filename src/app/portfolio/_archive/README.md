# Archived public demos

Retired from the public homepage in Phase B (2026-11-16) per the final master prompt's decisions:
no falling screws, no Ohm's law demo and no decorative spinning motor. Nothing else imported them.

- `hero.tsx` - previous hero with falling screws and theme switcher
- `companion.tsx` - floating terminal companion
- `motor-explorer.tsx` - Three.js motor viewer (only consumer of the `three` dependency)
- `ohm-lab.tsx` - resistor/current simulator

The `_archive` folder is private to the App Router and is never routed. To restore one, move it back
to `src/app/portfolio/` and import it from `src/app/page.tsx`.

These files are excluded from TypeScript and ESLint. The `three` and `@types/three` packages were
removed on 2026-11-17 because only `motor-explorer.tsx` used them; reinstall both before restoring it.
