# KOL Manager TODO

## Schema & Backend
- [x] Initial KOL table (basic fields)
- [x] Redesign schema: kols table (identity + audience metrics)
- [x] Add kol_posts table (post-level campaign metrics)
- [x] Run DB migration for new schema
- [x] Server: kol.list procedure (with search/filter)
- [x] Server: kol.getById procedure (with posts)
- [x] Server: kol.create procedure
- [x] Server: kol.update procedure
- [x] Server: kol.delete procedure
- [x] Server: kol.importCsv procedure with format detection

## CSV Intake Engine
- [x] Format detector (Cookie3 aggregate vs campaign post-tracker)
- [x] Header offset handler (blank rows, label rows)
- [x] Field mapper for all 5 format types
- [x] Deduplication logic for post-tracker formats
- [x] Follower count parser (strip commas)
- [x] Platform inference from post URLs
- [x] Engagement rate rounding

## Frontend
- [x] Dark Aethir-branded theme in index.css
- [x] DashboardLayout with sidebar navigation
- [x] Home dashboard with stat cards + category breakdown
- [x] KOL list page with table, search, filter by category/platform/region
- [x] CSV import modal with format preview + confirmation
- [x] KOL profile detail page (identity + metrics + posts)
- [x] Edit KOL modal
- [x] Delete KOL confirmation
- [x] Vitest tests for KOL procedures and intake engine
