# Idea Vault 3.0 — iPad + Pencil Addendum

**Status:** Optional enhancement to the existing master guides. **Do not replace or rebuild the existing application.**

## Purpose
The owner uses an iPad with a stylus and prefers visual workflows. Make the existing Idea Vault and Story Studio usable for sketching, annotating, and organizing visual ideas directly on iPad, while preserving desktop and touch functionality.

## Required first step: audit
Before writing code, inspect the repository and identify the current frontend framework, storyboard UI, image upload/storage, authentication, responsive layout, and any canvas/drawing libraries already installed. Report what can be reused. Do not assume a new editor is needed. Do not implement until the owner approves the plan.

## Priority 1: pencil-friendly storyboard panels
- Allow drawing rough sketches inside a storyboard shot or attaching a sketch from the iPad.
- Support stylus input and normal touch gestures; provide a visible pen/eraser tool and undo/redo.
- Save sketches as editable stroke data **when practical**, with an exportable PNG preview. Do not rely solely on a flattened image if later editing is required.
- Allow image import, simple annotations, shot reorder, and optional scene notes.
- Support touch-friendly hit targets and keyboard/mouse equivalents.
- Use pressure sensitivity only when the browser/device exposes it; graceful fallback to constant-width strokes.
- Test palm/touch handling in Safari on iPad; do not promise OS-level palm rejection from a website.

## Priority 2: reusable annotation
- Annotate character reference images and engineering diagrams with pen marks, arrows, and short labels.
- Preserve the original asset; store annotations as separate layers/data where feasible.
- Link annotations to the correct project, character, scene, or engineering note.
- Provide export/share as PNG or PDF only if supported by existing tooling and approved scope.

## Priority 3: visual board (later)
- Optional freeform board with movable cards, images, sketches, and relationships.
- Prefer an established library compatible with the existing stack rather than building a complex infinite-canvas engine.
- Do not let this delay the core Story Studio and Portfolio Manager.

## Deferred features
Handwriting-to-text, AI interpretation of sketches, sophisticated vector brushes, real-time multi-user collaboration, and infinite canvas are **not** part of the initial release. Evaluate only after the basic sketch/annotation workflow is reliable.

## Storage and security
- Follow existing Idea Vault permissions. All sketches and annotations are private by default.
- Store lightweight metadata and relationships in the app database; store image exports or large assets in the existing storage solution/Google Drive integration where authorized.
- Never expose private sketch URLs in public portfolio output. Publication requires the existing Completed + Published rule and explicit approval of the public asset.
- Support autosave carefully, with visible save state, failure recovery, and export/backup options.

## Acceptance tests
1. On iPad Safari, draw a storyboard sketch with a compatible stylus, erase, undo, redo, and save.
2. Reopen the same scene and recover the sketch without data loss.
3. Import a reference image and annotate it without modifying the original.
4. Rearrange shots with touch, with an accessible non-drag alternative.
5. Use the feature with mouse on desktop and finger on touch devices.
6. Private sketches cannot be retrieved anonymously via direct URLs or APIs.
7. No duplicate Story Studio, login system, or asset library is created.

## Codex / Claude Code implementation instruction
> Read this addendum alongside the existing Idea Vault 3.0 and connected Portfolio master guides. Audit existing drawing, upload, and storyboard capabilities first. Propose the smallest compatible implementation for iPad stylus sketching and annotations. Do not create a separate app or replace existing modules. Report file paths, dependencies, data changes, risks, and test plan; stop for approval before implementing.
