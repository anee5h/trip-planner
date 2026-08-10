# KAI-32 QA artifacts

- `KAI32_DATA_AUDIT.md` — claim→source ledger for all 30 new POIs and the
  pre-existing Chugoku audit (Section 2), plus image provenance, transport
  gaps, and generator controls.
- `recommendation-qa-before.txt` / `recommendation-qa-after.txt` — KAI-32
  Chugoku recommendation QA (origins: Okayama, Hiroshima, Osaka, Fukuoka,
  Tokyo × Any, Day Trip+Any, Half-day, Full-day, 2D1N) run against the
  pre-change index (b9f73278 worktree) and the final index.
- `recs-after.txt` — raw after-run output (same content as
  recommendation-qa-after.txt).

Before/after summary: 30 → 60 Chugoku records. Exactly one origin×case row
changed: Fukuoka · Day Trip + Half-day — `miyajima-itsukushima` (previously
ranked via a fabricated mainland rail corridor) no longer appears, so
korakuen-okayama and bitchu-matsuyama-castle move up one rank. No other
Chugoku top-25 rows changed in any origin×case; Tokyo and Fukuoka gained no
implausible new Chugoku day trips.
