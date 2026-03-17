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

## Expanded X API Enrichment
- [ ] DB: add profileImageUrl, profileBio, postLanguage, accountCreatedAt, verified, avgLikes, avgRetweets, avgReplies columns
- [ ] Server: normalize location to country via LLM
- [ ] Server: postLanguage from majority lang of last 10 tweets (Aethir-keyword first, fallback general)
- [ ] Server: pull profileBio, profileImageUrl, accountCreatedAt, verified from X user object
- [ ] Server: avgLikes, avgRetweets, avgReplies from @AethirCloud tweets (fallback to general)
- [ ] UI: avatar image in KolDetail and KolList table
- [ ] UI: bio, postLanguage, verified badge, accountCreatedAt in KolDetail
- [ ] UI: avgLikes, avgRetweets, avgReplies in metrics grid

## Bulk Edit
- [ ] Server: bulkEdit procedure (ids[], region?, postLanguage?, folderId?)
- [ ] UI: Edit button in bulk actions bar
- [ ] UI: Bulk edit modal with region, language, folder fields (all optional)
- [ ] UI: Apply only non-empty fields to all selected KOLs

## postLanguage Fix + KOL List Display
- [ ] Fix: verify enrichment writes postLanguage to DB (check updateKol accepts new fields)
- [ ] Add postLanguage column to KOL Database table

## Reports Page
- [ ] DB: reports table (id, name, keywords, keywordMode, startDate, endDate, kolIds, languages, regions, folderIds, createdAt)
- [ ] DB: report_results table (id, reportId, tweetId, authorHandle, authorName, content, postedAt, likes, retweets, replies, quotes, url)
- [ ] Server: report.search procedure (X API search with AND/OR keyword logic, date range, KOL/language/region/folder filters)
- [ ] Server: report.save procedure (save query + results to DB)
- [ ] Server: report.list procedure
- [ ] Server: report.getById procedure (with results)
- [ ] Server: report.delete procedure
- [ ] Server: report.exportCsv (return CSV string)
- [ ] Frontend: Reports page with keyword builder (AND/OR chips)
- [ ] Frontend: Date range picker (start + end)
- [ ] Frontend: KOL multi-select, language filter, region filter, folder filter
- [ ] Frontend: Run Search button → results table
- [ ] Frontend: Save Report modal (name input)
- [ ] Frontend: Saved Reports list
- [ ] Frontend: Export CSV button on saved reports
- [ ] Frontend: Delete saved report
- [ ] Sidebar nav: Reports link

## Reports UI Improvements
- [x] Smart keyword input: single bar, auto-detect AND/OR from natural language
- [x] Calendar date picker (dropdown) for start and end dates
- [x] Add Views, QT (quotes), Saves/Bookmarks columns to results table
- [x] Server: return views, quotes, bookmarks from X API search results
- [x] Switch search backend to twitterapi.io (viewCount + bookmarkCount native, full history)

## twitterapi.io Migration & Cost Tracker
- [x] Remove max results hard cap (allow full pagination, thousands of results)
- [x] Migrate KOL enrichment (user lookup + timeline) from X Basic API to twitterapi.io
- [x] Remove all api.twitter.com calls from backend
- [x] Add api_usage DB table to log credits consumed per operation
- [x] Server: log credits after each twitterapi.io call (search, enrich)
- [x] UI: Cost tracker widget on Dashboard showing total spend + breakdown

## KOL Edit & Campaigns Feature
- [x] Single KOL edit modal: add handle, display name, profile URL fields
- [x] Schema: campaigns table (name, description, budget, createdAt)
- [x] Schema: campaign_posts table (campaignId, kolId, tweetUrl, tweetId, budget, likes, retweets, replies, quotes, views, bookmarks, fetchedAt)
- [x] Server: campaign CRUD (create, list, get, delete)
- [x] Server: import post URLs into campaign (parse tweet ID, fetch metrics via twitterapi.io, link to KOL)
- [x] Server: refresh post metrics (re-fetch from twitterapi.io)
- [x] Server: edit budget on campaign_post
- [x] Campaigns page: list all campaigns with total budget + post count
- [x] Campaigns page: create campaign modal
- [x] Campaigns page: campaign detail view with post URL import, posts table, budget editing
- [x] KOL profile page: show campaign post history with engagement metrics
- [x] Add Campaigns to sidebar navigation

## Auto-Metrics & Missing KOL Detection
- [ ] Fix campaign fetchMetrics: use correct twitterapi.io flat field names (retweetCount, likeCount, etc.)
- [ ] Fix campaign fetchMetrics: reset status to "pending" for already-fetched posts so user can re-fetch
- [ ] Server: after campaign fetchMetrics, recalculate KOL avg metrics (avgLikes, avgRetweets, avgReplies, avgViews, engagementRate) from all campaign posts
- [ ] Server: after report search completes, auto-insert matching tweets into campaign_posts linked to known KOLs
- [ ] Server: after report search, return list of unknown handles (in results but not in KOL DB)
- [ ] Server: after campaign fetchMetrics, return list of unknown handles
- [ ] UI: "Missing KOLs" popup after report search — shows unknown handles, lets user create profiles, assign folders and campaigns
- [ ] UI: KOL profile metrics (avgViews, avgLikes, avgRetweets, avgReplies, engagementRate) auto-update from campaign posts
