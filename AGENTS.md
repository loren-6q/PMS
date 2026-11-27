# Wild & Wandering PMS — Permanent Engineering Rules

Follow these 5 non-negotiable rules on every task without exception:

1. **Channex API Push/Pull Protocol Is Sacred (`V4/channex.js`)**
   - NEVER alter push/pull patterns, sync architecture, rate limiting (18 req/min), contiguous date compression (`compressDateEntries`), or granular dirty tracking (`dirtyDates`, `dirtyAvailKeys`, `dirtyPlanKeys`) in `V4/channex.js`.
   - Never replace isolated/granular rate, restriction, or availability updates with broad pushes or full syncs for small edits.

2. **Strict Scope Discipline & V4-Only Editing**
   - Always edit files in `V4/` ONLY. Never edit `LIVE/` directly unless explicitly instructed to promote `V4/` to `LIVE/`.
   - Never modify unrelated code, styling, or existing working features outside the active task without discussing with the user first.

3. **Architecture Contract & Single Source of Truth (`files/roadmap.json`, `files/sitemap.txt`)**
   - Follow `files/roadmap.json` and `files/sitemap.txt` strictly (1-File / 1-Domain responsibility matrix).
   - Keep every function in ONE helper file and ONE place only — zero duplicate or near-duplicate functions across modules.
   - Never update `files/roadmap.json` or `files/sitemap.txt` without the user's explicit consent.

4. **Future Backlog (`files/future-features.json`)**
   - Capture out-of-scope or future feature ideas in `files/future-features.json` for later review rather than building unrequested features inline.

5. **Universal Commercial SaaS Standards — Zero Hardcoding, Zero Hacks**
   - Never write one-off hacks, shims, patches, or workarounds.
   - Never hardcode property-specific names, room types, currencies, Thailand-specific data, or Full Moon Party-specific assumptions into logic. Every fix must be generic, data-driven, and work for any hotel or hostel worldwide.
