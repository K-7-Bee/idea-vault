# Final Codex Master Prompt: Connected Portfolio + Idea Vault 3.0

> Paste the **Codex instruction** section into Codex with your existing repository. This is a specification, not a claim about the current codebase. Preserve the existing Idea Vault 3.0 guide and reconcile differences before implementing.

## Product vision
Build **one connected application with two clearly separated experiences**:
- **Public portfolio:** a restrained, credible engineering-student portfolio showing education, two real internships, an Innovation Fair certificate, authentic experience, selected projects, and contact information.
- **Private Idea Vault:** the existing authenticated workspace for idea capture, Engineering Lab, visual Story Studio, project progress, AI assistance, Google Drive references, and a new Portfolio Manager.

The portfolio is a *curated public view* of approved content, not a second disconnected database. The private workspace is the source of truth. Preserve existing work and credentials.

## Codex instruction (paste from here)

You are a senior full-stack engineer, security reviewer, product designer, and pragmatic technical lead. Upgrade my EXISTING portfolio and Idea Vault repository in place. **Do not scaffold a new app, replace my stack, or overwrite working features without an audit and explicit approval.**

### 0. Start with a repository audit, not implementation
1. Inspect framework, routes, styling, database, storage, deployment, auth, existing Idea Vault statuses, project schema, and current public portfolio sections.
2. List what exists versus what is merely proposed. Do not invent content, internships, skills, credentials, projects, or achievements.
3. Identify risks, backups, migrations, dependencies, costs, and potential breaking changes.
4. Produce `docs/portfolio-idea-vault-audit.md`, `docs/architecture-plan.md`, `docs/implementation-checklist.md`, and a concise phased execution plan.
5. **STOP for my approval** before schema migrations, deleting features, replacing authentication, enabling public access, or deployment.

### 1. Public portfolio: design and information architecture
Design for a prospective engineering internship/job reviewer. Professional, calm, distinctive, responsive, accessible, and fast. Keep the dark charcoal/near-black theme and *subtle* cyan accent; avoid glowing overload. Use strong typography, generous whitespace, clear hierarchy, mobile-first layout, restrained hover/scroll transitions, reduced-motion support, and excellent contrast.

Public navigation: **Home | About | Experience | Projects | Journal | Contact**. Merge or hide empty sections gracefully rather than using fake placeholders.

- **Home:** one-sentence identity, engineering focus (embedded systems and software interests, without claiming mastery), short introduction, selected verified highlights, concise CTA to Projects/Experience/Resume/Contact. Optional small 'Currently Building' teaser, but only if I explicitly approve the exact public text. Do not publish work-in-progress private records.
- **About:** accurate education, technical interests, current learning direction, real skills at defensible levels, and certificates.
- **Experience:** the two internships with organization, dates, role, tools, actual responsibilities, and learning outcomes **only after I supply/verify them**. No fabricated impact metrics.
- **Projects:** cards and case studies sourced from approved public project snapshots. Case study template: problem, objective, approach, tools, implementation, evidence/photos, results, limitations, lessons, links. No fabricated hardware measurements or performance claims.
- **Journal:** optional short, real engineering notes and lessons linked to their parent projects; unpublished by default. No generic AI-generated filler.
- **Contact:** safe contact method, verified GitHub/LinkedIn links, downloadable résumé if provided; protect personal details and prevent spam.

**Remove from the public experience** the falling-screws effect, basic resistor/current simulator, and decorative spinning-motor animation. Before deleting code or assets, inventory and archive them safely; confirm whether any are reused elsewhere. Do not replace them with more showpieces or an unnecessary public chatbot.

### 2. Private Idea Vault: one login, one workspace
Reuse the existing login and authorization if secure; audit before changes. Do not add a second login. Private navigation should include:
- Dashboard / Ideas
- Engineering Lab
- Story Studio
- Project Library / References
- **Portfolio Manager**
- Optional private career/learning dashboard
- Settings / account / integrations

Maintain current stages **Exploring → Analyzing → Building → Completed**. Project types: Engineering, Story, Hybrid. Completion status and publication status are independent. Only **Completed AND Published** projects may appear in public Projects. Draft, in-progress, unpublished, internal attachments, AI chats, notes, and Drive originals remain private.

Engineering Lab: project goals, task board, milestones, technical notes, component lists, code/repository links, experiments, test evidence, results, and lessons. Do not force simulations.

Story Studio: image-first Story Library; Story Bible; Character Bible; optional Season → Episode → Scene → Shot hierarchy; drag-and-drop visual shot panels; references, timeline, character relationships, continuity records. **Do not build a 3D editor, renderer, or rigging application.**

AI: Gemini via secure server-side adapter, configurable quotas and fallback behavior. Contextual suggestions for engineering and storytelling; structured evidence and exact scene/shot references for story-memory answers; no silent edits. Every proposed mutation requires review and approval. Do not assume image generation is free; verify provider capabilities and costs before enabling.

Google Drive: least-privilege OAuth, secure token handling, link and permission validation, graceful disconnect, selective file retrieval. Store application metadata in database, large originals in Drive where appropriate.

### 3. Portfolio Manager inside Idea Vault
Build a private admin experience using the existing authentication:
- Editable **Home, About, Education, Experience, Certificates, Resume, Social Links, Contact, Journal**, and project showcase settings.
- Draft and published versions, preview before publish, save drafts, publish/unpublish, history and rollback where practical.
- Media picker/reference library that can reuse an asset without uploading duplicate copies.
- A **Ready to Showcase** queue of Completed projects. A project never publishes automatically merely because it is Completed.
- Public showcase editor chooses title, summary, cover, selected images, allowed technical details, and links.
- **Publish Preview** must match the actual public output. Require explicit confirmation.
- Public pages read from a **whitelisted published projection/snapshot**. Never expose entire private project objects or unapproved Drive links.
- If a published project is changed back to an incomplete status or unpublished, remove it from public access immediately and invalidate relevant caches.
- Journal entries and 'Currently Building' teasers have separate explicit publication controls and must never bypass project-publication rules or leak private records.

### 4. Security and data correctness
- Enforce server-side authorization on **every** private read, write, media access, AI context retrieval, and admin API.
- Use secure sessions, CSRF protections where applicable, input validation, output encoding, rate limiting, secrets only on server, safe upload handling, and least-privilege storage.
- Test direct URL/API access as an anonymous visitor, including image URLs, thumbnails, search, metadata, cached responses, and published/unpublished transitions.
- Prefer reversible migrations, backups, export/import with validation, and audit logs.
- Preserve existing content and IDs. Do not invent data to make the design appear complete.

### 5. Delivery sequence
**Phase A: Audit and design approval.** Existing-system inventory, route map, wireframes, schema diff, security review, migration and rollback plan. STOP for approval.

**Phase B: Public cleanup.** Archive/remove unwanted animations and demos safely; redesign homepage and sections using verified content. Make mobile and accessibility tests pass.

**Phase C: Portfolio Manager.** Add authenticated editing, draft/preview/publish, media references, résumé and profile editing, change history.

**Phase D: Project publishing bridge.** Reuse Idea Vault project data; Ready to Showcase queue; separate public projection; Completed + Published gating; privacy tests.

**Phase E: Idea Vault 3.0 modules.** Reconcile with the existing Idea Vault master guide and implement Engineering Lab, visual Story Studio, Gemini, Drive integrations incrementally. Do not reimplement already-working modules.

**Phase F: Hardening and launch.** End-to-end tests, permissions, migrations, performance, mobile, backups, export, documentation, staging preview, deployment only after approval.

### 6. Required tests / acceptance
1. Anonymous visitors can view only approved public content.
2. Direct private API/asset access is denied without authorization.
3. A project marked Completed but not Published is invisible publicly.
4. A Published flag on a non-Completed project does not expose it.
5. A Completed + Published project shows only its approved showcase fields.
6. Unpublishing or reverting status removes public content and cached exposure.
7. Portfolio editing works through the existing Idea Vault login, without editing source code.
8. Draft preview, save, publish, and rollback behave predictably.
9. Real internship, education, certificate, and project content are never invented.
10. Layout works on phone/tablet/desktop and respects reduced motion.
11. Existing Idea Vault data and project workflows survive migrations.
12. The website can be deployed and maintained with documented configuration and recovery steps.

### 7. Codex operating rules
- Work in small reviewable commits or change sets; explain each before implementation.
- Show file changes, migration impact, tests run, and known limitations after each phase.
- Ask focused questions only for genuinely missing content, security decisions, or irreversible actions.
- Use placeholders clearly marked **unpublished** in the private editor only, never as public achievements.
- Prefer existing dependencies and established conventions. No gratuitous framework rewrite.
- Do not spend time polishing animation while core content, privacy, or publishing is broken.
- Stop at the end of each phase for review; do not implement the entire roadmap in one pass.

### FIRST MESSAGE TO CODEX
> Read this master prompt, my existing Idea Vault 3.0 guide, and the repository. Start with Phase A ONLY. Audit what is implemented, compare it against this specification, propose a minimal-risk architecture and ordered task list, identify missing factual content I must supply, and produce wireframes for public portfolio plus private Portfolio Manager. Do not modify production data, delete components, migrate the database, or deploy anything yet. Present the findings and wait for approval.

## End of Codex instruction

## Decisions already made
- Keep portfolio and Idea Vault connected as one application.
- Put the Portfolio Manager inside password-protected Idea Vault.
- No basic Ohm's law demo, decorative spinning motor, or falling screws on public portfolio.
- No public project until both Completed and Published, with a curated public snapshot.
- No fabricated accomplishments; emphasize real education, internships, certificate, and progressively documented work.
- Avoid unnecessary public AI chatbot and in-browser 3D creation suite.

## Information to supply during audit
Actual repository access, hosting/deployment setup, current auth/database design, verified education and internship details, certificate metadata, existing résumé, approved links and photos, and the existing Idea Vault 3.0 guide.
# color palette
--atomic-tangerine: #ff6b35ff;
--peach-glow: #f7c59fff;
--beige: #efefd0ff;
--steel-azure: #004e89ff;
--baltic-blue: #1a659eff;