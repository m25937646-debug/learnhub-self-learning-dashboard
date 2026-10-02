# LearnHub — Managed permanent website plan

## Scope and decisions

LearnHub remains the existing Arabic self-learning dashboard, not a rewrite. The next release improves performance and adds interactive learning workflows while preserving the existing JSON learning snapshot, OAuth, managed MySQL, object storage, universal file preview, and permanent Webdev deployment.

### Design direction

- **Movement:** quiet dark-mode productivity dashboard with a restrained editorial feel.
- **Core principles:** focus before decoration; clear ownership of data; dense but calm information hierarchy; safe reversible actions.
- **Color philosophy:** deep navy surfaces reduce visual noise, teal marks progress and trusted actions, and warm gold is reserved for attention and account actions.
- **Layout paradigm:** a persistent navigation rail and a wide workspace with a dashboard command center rather than a centered marketing grid.
- **Signature elements:** compact teal progress accents, bordered study-card surfaces, and Arabic-first microcopy with explicit save/offline status labels.
- **Interaction:** every action is direct, keyboard accessible, reversible where possible, and accompanied by an immediate status.
- **Animation:** short opacity/translate transitions only for navigation, search, drag/drop feedback, and save status; no continuous decorative motion.
- **Typography:** system Arabic sans fallback for readable body copy, with strong weight contrast for section labels and compact metadata.
- **Brand essence:** “مساحة هادئة تحول نية التعلم إلى خطوات قابلة للقياس” — calm, practical, trustworthy.
- **Brand voice:** concise and encouraging. Example lines: “خطوتك التالية واضحة.” and “بياناتك محفوظة حتى لو انقطع الاتصال.”
- **Wordmark/logo:** existing LearnHub mark and teal book icon remain the product identity.
- **Signature brand color:** the existing bright teal used for progress and primary confirmations.

## Implementation decisions

1. Keep the existing account-scoped learning snapshot as the source of truth for plans, notes, reviews, attachments, and settings. Add only small durable tables for focus-session analytics and event history where cross-device reporting benefits from structured data.
2. Add a shared search index and insight calculators so Dashboard, global search, notifications, and AI context use the same normalized data instead of repeating expensive scans.
3. Debounce local/cloud writes, preserve the latest offline snapshot, retry queued cloud writes on reconnect, and expose online/offline/save state in the interface.
4. Add lazy loading for heavy file preview/AI surfaces, lazy image decoding, safer PWA caching, and pagination limits on file/index reads. Never cache authenticated API responses or private storage URLs.
5. Add interactive dashboard cards: progress/streak metrics, notification center, global search, quick focus sessions, weekly analytics, and next-step recommendations.
6. Extend focus sessions with completed-session history; retain the existing timer and alarms, and reuse the same review schedule for spaced repetition with explicit “تمت / أعد لاحقًا” actions.
7. Add drag-and-drop reordering to plan items with keyboard-safe move controls, global search across domains/titles/tasks/thoughts/attachments, and note tags plus related attachment metadata.
8. Keep the assistant grounded in the current user snapshot and explicitly label missing context. AI outputs remain advisory and never mutate learning data without a user action.
9. Keep database changes additive and migration-backed. Production startup applies unfinished migrations before serving traffic, and the health route remains unauthenticated.

## Project structure

- `client/src/App.tsx`: existing dashboard orchestration and domain-specific screens; receives the new dashboard/search/offline feature components.
- `client/src/components/InteractiveInsights.tsx`: progress cards, notification center, focus widget, and global search modal.
- `client/src/lib/learning-index.ts`: normalized search index, progress metrics, notification derivation, and focus helpers.
- `client/src/lib/offline.ts`: service-worker registration and reconnect/save-status events.
- `server/_core/`: Express bootstrap, OAuth callback/session verification, storage proxy, uploads, migrations/startup, and tRPC.
- `server/routers.ts`, `server/db.ts`, `drizzle/`: authenticated analytics/focus-session persistence and additive schema migrations.
- `shared/`: pure learning calculations and testable business rules.
- `client/public/`: route manifest, icons, PWA assets, safer cache service worker, and static artwork.
- `Dockerfile`, `package.json`, `pnpm-lock.yaml`: reproducible install, build, migration, and runtime contract.

## Required outcome

The permanent site must retain current login, uploads, universal previews, cloud save, and learning workflows while adding fast search, interactive progress/notifications/focus workflows, drag-and-drop planning, spaced repetition actions, attachment-aware notes, grounded assistant context, offline/PWA behavior, structured analytics, and a reproducible migration-safe production startup. The final checkpoint must pass TypeScript, focused tests, production build, route/health checks, and publish successfully.
