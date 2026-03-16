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

## Bulk Selection & Actions
- [x] Checkbox column in KOL list table
- [x] Select all / deselect all toggle in table header
- [x] Individual row deselect
- [x] Bulk actions bar (appears when 1+ selected): delete, status change, enrich
- [x] Selection count display

## Handle-Only CSV Import
- [x] New "Add KOLs" button / flow separate from full CSV import
- [x] Server: importHandles procedure (accepts list of X handles)
- [x] Auto-creates KOL records with handle + platform=X + status=pending
- [x] Deduplicates against existing handles in DB
- [x] Preview before import (shows handles, flags duplicates)

## X API Enrichment
- [x] Server: enrichKol procedure (single KOL, calls X API when key present)
- [x] Server: enrichBulk procedure (batch enrichment for selected KOLs)
- [x] Enrichment status field on KOL (never / pending / done / failed)
- [x] Per-KOL enrich button on profile and list row
- [x] Bulk enrich action in bulk actions bar
- [x] X API key config via secrets
- [x] Graceful stub when X API key not set (shows "API key required" message)

## Folders (KOL Groups)
- [x] folders table (id, name, description, color, createdAt)
- [x] kol_folders join table (kolId, folderId) — many-to-many
- [x] DB migration for folders + kol_folders
- [x] Server: folder.list, folder.create, folder.update, folder.delete
- [x] Server: folder.addKols, folder.removeKols, folder.getKols
- [x] Assign folder(s) during handle CSV import
- [x] Assign folder(s) during bulk selection (bulk actions bar)
- [x] Assign/remove folder on individual KOL profile page
- [x] Folders page: list all folders with KOL count, click to view KOLs in folder
- [x] Folder detail page: KOLs in this folder, same table as KOL list
- [x] Folder pill/badge shown on KOL list rows and profile
- [x] Sidebar nav item for Folders

## Handle Import — URL Recognition
- [x] Parse x.com/twitter.com profile URLs to extract handle (e.g. https://x.com/elonmusk → elonmusk)
- [x] Accept @handle, handle, and full URL in same CSV column
- [x] Strip query strings and trailing slashes from URLs before extracting handle

## Deduplication
- [x] Within-batch dedup: if same handle appears multiple times in one CSV, only create one KOL record
- [x] Cross-import dedup: if handle already exists in DB, skip creation (no duplicate profile)
- [x] Dedup applies to both handle-only import and full campaign CSV import
- [x] Import result summary shows: inserted, skipped (already exists), skipped (duplicate in batch)
- [x] Campaign CSV: if KOL already exists, still append new posts to existing KOL record (upsert logic)
