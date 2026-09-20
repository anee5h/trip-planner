# Historical engineering records

These documents preserve dated investigations, designs, and release planning that are useful for provenance but are **not current product, infrastructure, or release guidance**. Current behavior belongs in the active documents linked from the root README: architecture, recommendation engine, transport estimation, data quality, testing strategy, and the protected Allure/QA guide.

## Archived records

- [`roadmap-v2.0.md`](roadmap-v2.0.md) — TabiMap-era v2.0 planning and release milestones; historical roadmap only.
- [`destinations-filter-exclusion-analysis.md`](destinations-filter-exclusion-analysis.md) — the 2026-08-04 627-record filter diagnosis; its counts are historical, not current catalogue measurements.
- [`kai-132-migration-design.md`](kai-132-migration-design.md) — pre-migration lazy-catalogue design; current runtime behavior is documented by [`docs/architecture.md`](../architecture.md) and KAI-121 tests.
- [`kai-198-ddos-cost-hardening.md`](kai-198-ddos-cost-hardening.md) and [`kai-198-cloudflare-supabase-research.md`](kai-198-cloudflare-supabase-research.md) — dated repository-side security/cost evidence and first-party research; production account state remains owner-managed.

- [`repository-hygiene-phase-b.md`](repository-hygiene-phase-b.md) — Phase B screenshot/audit-artifact disposition and retained-dependency record.

Historical QA evidence remains with its report where scripts or relative evidence links depend on that layout, including [`docs/KAI-206-audit.md`](../KAI-206-audit.md), [`docs/ui-polish-audit.md`](../ui-polish-audit.md), [`docs/qa/`](../qa/), and [`qa/`](../../qa/). Do not read old measurements or screenshots as current production facts without a fresh run.

## Lightweight retention policy

- Current engineering guidance belongs in `README.md` or focused documents directly under `docs/`.
- Historical investigations and superseded designs belong here; ticket-specific QA evidence remains under `qa/<ticket>/` or beside its report.
- Commit screenshots only when they prove a distinct route, locale, viewport, state, or before/after behavior that text and automated checks cannot establish. Keep representative evidence, inspect it for personal data/tokens, and preserve readable dimensions.
- Keep generated reports, caches, traces, and local exports untracked unless a validator, test, manifest, or reproducibility workflow consumes them. Do not delete committed audit inputs or ledgers merely because they are large.
- Move with `git mv`, update Markdown/source/script references, and run repository-wide link checks. Remove disposable PR drafts only after verifying the final PR retains their material information.
- Moving files improves organization but does not reduce tracked bytes. Removing a file from the current tree does not erase it from Git history; history rewriting and force-pushing `main` are outside normal hygiene.
