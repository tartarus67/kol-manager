import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  listKols,
  getKolById,
  getKolPosts,
  createKol,
  updateKol,
  deleteKol,
  bulkImportWithPosts,
  importHandles,
  bulkDeleteKols,
  bulkUpdateStatus,
  bulkEditKols,
  updateKolEnrichment,
  listFolders,
  getFolderById,
  createFolder,
  updateFolder,
  deleteFolder,
  getKolsInFolder,
  getFoldersForKol,
  addKolsToFolder,
  removeKolsFromFolder,
  setKolFolders,
  createReport,
  listReports,
  getReportById,
  deleteReport,
  saveReportResults,
  getReportResults,
  logApiUsage,
  getApiUsageStats,
  listCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getCampaignPosts,
  getKolCampaignPosts,
  insertCampaignPost,
  updateCampaignPost,
  deleteCampaignPost,
  recalcKolMetrics,
  autoInsertReportTweets,
} from "./db";
import { parseCSV } from "./csvIntake";
import { ENV } from "./_core/env";
import { InsertKolPost } from "../drizzle/schema";

// ─── Shared input schemas ─────────────────────────────────────────────────────

const kolUpdateInput = z.object({
  handle: z.string().min(1).optional(),
  displayName: z.string().optional(),
  platform: z.string().optional(),
  profileUrl: z.string().optional(),
  followers: z.number().optional(),
  smartFollowers: z.number().optional(),
  engagementRate: z.number().optional(),
  avgEngagement: z.number().optional(),
  avgImpressions: z.number().optional(),
  score: z.number().optional(),
  tier: z.string().optional(),
  region: z.string().optional(),
  category: z.string().optional(),
  contentType: z.string().optional(),
  contentFormat: z.string().optional(),
  tags: z.string().optional(),
  costPerPost: z.number().optional(),
  status: z.enum(["active", "inactive", "pending"]).optional(),
  notes: z.string().optional(),
});

// ─── Handle/URL normalizer ────────────────────────────────────────────────────
// Accepts: @handle, handle, https://x.com/handle, https://twitter.com/handle
// Returns: lowercase handle string, or null if unparseable

function normalizeHandle(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Full URL: extract last path segment
  if (trimmed.includes("x.com/") || trimmed.includes("twitter.com/")) {
    try {
      const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      // pathname is like /elonmusk or /elonmusk/status/... — take first segment
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length > 0 && parts[0] !== "i" && parts[0] !== "search") {
        return parts[0].toLowerCase();
      }
    } catch {
      // fallback: regex extract
      const m = trimmed.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,50})/);
      if (m) return m[1].toLowerCase();
    }
    return null;
  }

  // @handle or bare handle
  const handle = trimmed.replace(/^@/, "").toLowerCase();
  // X handles: 1-50 chars, alphanumeric + underscore only
  if (/^[a-z0-9_]{1,50}$/.test(handle)) return handle;

  return null;
}

// ─── KOL router ──────────────────────────────────────────────────────────────

const kolRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      region: z.string().optional(),
    }))
    .query(({ input }) => listKols(input.search, input.category, input.region)),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const kol = await getKolById(input.id);
      const posts = kol ? await getKolPosts(input.id) : [];
      const kolFolderList = kol ? await getFoldersForKol(input.id) : [];
      return { kol, posts, folders: kolFolderList };
    }),

  create: protectedProcedure
    .input(z.object({
      handle: z.string().min(1),
      displayName: z.string().optional(),
      platform: z.string().optional(),
      profileUrl: z.string().optional(),
      followers: z.number().optional(),
      smartFollowers: z.number().optional(),
      engagementRate: z.number().optional(),
      avgEngagement: z.number().optional(),
      avgImpressions: z.number().optional(),
      score: z.number().optional(),
      tier: z.string().optional(),
      region: z.string().optional(),
      category: z.string().optional(),
      contentType: z.string().optional(),
      contentFormat: z.string().optional(),
      tags: z.string().optional(),
      costPerPost: z.number().optional(),
      status: z.enum(["active", "inactive", "pending"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(({ input }) => createKol(input)),

  update: protectedProcedure
    .input(z.object({ id: z.number(), data: kolUpdateInput }))
    .mutation(({ input }) => updateKol(input.id, input.data)),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteKol(input.id)),

  // ─── Bulk operations ──────────────────────────────────────────────────────

  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(({ input }) => bulkDeleteKols(input.ids)),

  bulkUpdateStatus: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1),
      status: z.enum(["active", "inactive", "pending"]),
    }))
    .mutation(({ input }) => bulkUpdateStatus(input.ids, input.status)),

  bulkAddToFolder: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1),
      folderId: z.number(),
    }))
    .mutation(({ input }) => addKolsToFolder(input.ids, input.folderId)),

  bulkEdit: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1),
      region: z.string().optional(),
      postLanguage: z.string().optional(),
      category: z.string().optional(),
      tier: z.string().optional(),
      folderId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { ids, folderId, ...fields } = input;
      const updateData: Partial<Record<string, string>> = {};
      if (fields.region !== undefined) updateData.region = fields.region;
      if (fields.postLanguage !== undefined) updateData.postLanguage = fields.postLanguage;
      if (fields.category !== undefined) updateData.category = fields.category;
      if (fields.tier !== undefined) updateData.tier = fields.tier;
      if (Object.keys(updateData).length > 0) {
        await bulkEditKols(ids, updateData as any);
      }
      if (folderId !== undefined) {
        await addKolsToFolder(ids, folderId);
      }
      return { updated: ids.length };
    }),

  // ─── Handle/URL import ────────────────────────────────────────────────────
  // Each entry can be: @handle, handle, https://x.com/handle, https://twitter.com/handle

  previewHandles: protectedProcedure
    .input(z.object({ rawText: z.string() }))
    .mutation(({ input }) => {
      const lines = input.rawText
        .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean);

      const parsed: Array<{ raw: string; handle: string | null; valid: boolean }> = [];
      const seen = new Set<string>();

      for (const line of lines) {
        // Take first CSV column if multi-column
        const firstCol = line.split(",")[0].replace(/"/g, "").trim();
        // Skip obvious header rows
        if (["handle", "username", "screen_name", "twitter", "url", "profile"].includes(firstCol.toLowerCase())) continue;

        const handle = normalizeHandle(firstCol);
        const isDup = handle ? seen.has(handle) : false;
        if (handle) seen.add(handle);

        parsed.push({ raw: firstCol, handle, valid: handle !== null && !isDup });
      }

      const valid = parsed.filter(p => p.valid).map(p => p.handle as string);
      const invalid = parsed.filter(p => !p.valid);

      return { total: lines.length, valid: valid.length, invalid: invalid.length, preview: parsed.slice(0, 20), handles: valid };
    }),

  importHandles: protectedProcedure
    .input(z.object({
      handles: z.array(z.string().min(1)).min(1),
      region: z.string().optional(),
      folderIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await importHandles(input.handles, input.region);

      // If folder assignment requested, get the newly inserted KOL IDs and assign
      if (input.folderIds && input.folderIds.length > 0 && result.insertedIds.length > 0) {
        for (const folderId of input.folderIds) {
          await addKolsToFolder(result.insertedIds, folderId);
        }
      }

      return result;
    }),

  // ─── Folder assignment for individual KOL ────────────────────────────────

  setFolders: protectedProcedure
    .input(z.object({ kolId: z.number(), folderIds: z.array(z.number()) }))
    .mutation(({ input }) => setKolFolders(input.kolId, input.folderIds)),

  getFolders: protectedProcedure
    .input(z.object({ kolId: z.number() }))
    .query(({ input }) => getFoldersForKol(input.kolId)),

  // ─── X API Enrichment ─────────────────────────────────────────────────────

  enrichKol: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const kol = await getKolById(input.id);
      if (!kol) throw new Error("KOL not found");
      const apiKey = ENV.twitterApiIoKey;
      if (!apiKey) {
        return { success: false, reason: "TWITTERAPI_IO_KEY_MISSING", message: "twitterapi.io API key not configured. Add twitterapi_io_key to your secrets to enable enrichment." };
      }
      // Enrich profile data
      const result = await enrichSingleKol(kol.id, kol.handle, apiKey);
      // Also re-fetch campaign post metrics for this KOL
      try {
        const posts = await getKolCampaignPosts(kol.id);
        const toFetch = posts.filter(p => p.tweetId);
        for (const post of toFetch) {
          try {
            let tweet: any = null;
            if (post.kolHandle) {
              const sinceId = String(Number(post.tweetId!) - 1);
              const q = encodeURIComponent(`from:${post.kolHandle} since_id:${sinceId} max_id:${post.tweetId}`);
              const res = await fetchWithRetry(
                `https://api.twitterapi.io/twitter/tweet/advanced_search?query=${q}&queryType=Latest&count=1`,
                { headers: { "X-API-Key": apiKey } }
              );
              if (res.ok) {
                const json = await res.json() as any;
                tweet = json?.tweets?.find((t: any) => String(t.id) === String(post.tweetId))
                  ?? (json?.tweets?.length === 1 ? json.tweets[0] : null);
              }
            }
            if (!tweet) {
              const q2 = encodeURIComponent(`url:${post.tweetId}`);
              const res2 = await fetchWithRetry(
                `https://api.twitterapi.io/twitter/tweet/advanced_search?query=${q2}&queryType=Latest&count=1`,
                { headers: { "X-API-Key": apiKey } }
              );
              if (res2.ok) {
                const j2 = await res2.json() as any;
                tweet = j2?.tweets?.find((t: any) => String(t.id) === String(post.tweetId))
                  ?? (j2?.tweets?.length > 0 ? j2.tweets[0] : null);
              }
            }
            if (tweet) {
              await updateCampaignPost(post.id, {
                likes: tweet.likeCount ?? 0,
                retweets: tweet.retweetCount ?? 0,
                replies: tweet.replyCount ?? 0,
                quotes: tweet.quoteCount ?? 0,
                views: tweet.viewCount ?? null,
                bookmarks: tweet.bookmarkCount ?? null,
                tweetText: tweet.text ?? null,
                fetchStatus: "done",
                fetchError: null,
                fetchedAt: new Date(),
              });
            }
          } catch { /* skip individual post failures */ }
        }
        await recalcKolMetrics(kol.id);
      } catch { /* don't fail enrichment if post re-fetch fails */ }
      return result;
    }),

  enrichBulk: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      const apiKey = ENV.twitterApiIoKey;
      if (!apiKey) {
        return { success: false, reason: "TWITTERAPI_IO_KEY_MISSING", message: "twitterapi.io API key not configured.", enriched: 0, failed: 0 };
      }
      let enriched = 0; let failed = 0; const errors: string[] = [];
      for (let i = 0; i < input.ids.length; i++) {
        const id = input.ids[i];
        const kol = await getKolById(id);
        if (!kol) continue;
        try {
          await updateKolEnrichment(id, { enrichmentStatus: "pending" });
          const result = await enrichSingleKol(id, kol.handle, apiKey);
          if (result.success) enriched++; else { failed++; errors.push(`@${kol.handle}: ${result.message}`); }
        } catch (e: any) {
          failed++; errors.push(`@${kol.handle}: ${e.message}`);
          await updateKolEnrichment(id, { enrichmentStatus: "failed" });
        }
      }
      return { success: true, enriched, failed, errors };
    }),

  // ─── Full CSV import (campaign sheets) ───────────────────────────────────

  importCsv: protectedProcedure
    .input(z.object({ csvText: z.string(), sourceLabel: z.string().optional() }))
    .mutation(async ({ input }) => {
      const result = parseCSV(input.csvText, input.sourceLabel);
      if (result.format === "UNKNOWN") {
        return { success: false, format: "UNKNOWN", kolsInserted: 0, postsInserted: 0, warnings: result.warnings };
      }
      const postsByHandle = new Map<string, InsertKolPost[]>();
      if (result.posts.length > 0) {
        const reparse = parseCSVWithHandleMap(input.csvText, input.sourceLabel);
        Array.from(reparse.postsByHandle.entries()).forEach(([handle, posts]) => {
          postsByHandle.set(handle, posts);
        });
      }
      const { kolsInserted, kolsSkipped, postsInserted } = await bulkImportWithPosts(result.kols, postsByHandle);
      return { success: true, format: result.format, kolsInserted, kolsSkipped, postsInserted, warnings: result.warnings };
    }),

  previewCsv: protectedProcedure
    .input(z.object({ csvText: z.string() }))
    .mutation(({ input }) => {
      const result = parseCSV(input.csvText);
      return { format: result.format, kolCount: result.kols.length, postCount: result.posts.length, warnings: result.warnings, sample: result.kols.slice(0, 5) };
    }),
});

// ─── Folder router ────────────────────────────────────────────────────────────

const folderRouter = router({
  list: protectedProcedure
    .query(() => listFolders()),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const folder = await getFolderById(input.id);
      const kols = folder ? await getKolsInFolder(input.id) : [];
      return { folder, kols };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      description: z.string().optional(),
      color: z.string().optional(),
    }))
    .mutation(({ input }) => createFolder(input)),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(128).optional(),
      description: z.string().optional(),
      color: z.string().optional(),
    }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return updateFolder(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteFolder(input.id)),

  addKols: protectedProcedure
    .input(z.object({ folderId: z.number(), kolIds: z.array(z.number()).min(1) }))
    .mutation(({ input }) => addKolsToFolder(input.kolIds, input.folderId)),

  removeKols: protectedProcedure
    .input(z.object({ folderId: z.number(), kolIds: z.array(z.number()).min(1) }))
    .mutation(({ input }) => removeKolsFromFolder(input.kolIds, input.folderId)),

  getKols: protectedProcedure
    .input(z.object({ folderId: z.number() }))
    .query(({ input }) => getKolsInFolder(input.folderId)),

  removeKol: protectedProcedure
    .input(z.object({ folderId: z.number(), kolId: z.number() }))
    .mutation(({ input }) => removeKolsFromFolder([input.kolId], input.folderId)),
});

// ─── Report router ──────────────────────────────────────────────────────────

const reportRouter = router({
  list: protectedProcedure
    .query(() => listReports()),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const report = await getReportById(input.id);
      const results = report ? await getReportResults(input.id) : [];
      return { report, results };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteReport(input.id)),

  search: protectedProcedure
    .input(z.object({
      keywords: z.array(z.string().min(1)).min(1),
      keywordMode: z.enum(["AND", "OR"]).default("OR"),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      kolIds: z.array(z.number()).optional(),
      languages: z.array(z.string()).optional(),
      regions: z.array(z.string()).optional(),
      folderIds: z.array(z.number()).optional(),
      maxResults: z.number().min(1).optional(), // no cap — paginate until exhausted or limit reached
    }))
    .mutation(async ({ input }) => {
      const apiKey = ENV.twitterApiIoKey;
      if (!apiKey) {
        return { success: false, reason: "TWITTERAPI_IO_KEY_MISSING", message: "twitterapi.io API key not configured. Add twitterapi_io_key to your secrets.", results: [] };
      }

      // Resolve KOL handles from folderIds if provided
      let targetHandles: string[] = [];
      let targetKolIds: number[] = input.kolIds ?? [];

      if (input.folderIds && input.folderIds.length > 0) {
        const { getKolsInFolder } = await import("./db");
        for (const fid of input.folderIds) {
          const folderKols = await getKolsInFolder(fid);
          targetKolIds = [...new Set([...targetKolIds, ...folderKols.map(k => k.id)])];
        }
      }

      // Get handles for all target KOL IDs
      if (targetKolIds.length > 0) {
        const allKols = await listKols();
        const kolMap = new Map(allKols.map(k => [k.id, k]));
        targetHandles = targetKolIds
          .map(id => kolMap.get(id)?.handle)
          .filter((h): h is string => !!h);
      }

      // Build search query (same Twitter advanced search syntax)
      let queryParts: string[] = [];

      if (input.keywordMode === "AND") {
        queryParts = input.keywords.map(k => k.includes(" ") ? `"${k}"` : k);
      } else {
        const orPart = input.keywords.map(k => k.includes(" ") ? `"${k}"` : k).join(" OR ");
        queryParts = [`(${orPart})`];
      }

      // Add KOL filter: from: operators
      if (targetHandles.length > 0 && targetHandles.length <= 20) {
        const fromPart = targetHandles.map(h => `from:${h}`).join(" OR ");
        queryParts.push(`(${fromPart})`);
      }

      // Add language filter
      if (input.languages && input.languages.length === 1) {
        queryParts.push(`lang:${input.languages[0]}`);
      }

      // Add date range (twitterapi.io uses since: / until: in query string)
      if (input.startDate) {
        const d = new Date(input.startDate);
        const since = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}_00:00:00_UTC`;
        queryParts.push(`since:${since}`);
      }
      if (input.endDate) {
        const d = new Date(input.endDate);
        const until = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}_23:59:59_UTC`;
        queryParts.push(`until:${until}`);
      }

      // Exclude retweets
      queryParts.push("-is:retweet");

      const query = queryParts.join(" ");

      // Paginate twitterapi.io to collect up to maxResults tweets
      const allKols = await listKols();
      const handleToKolId = new Map(allKols.map(k => [k.handle.toLowerCase(), k.id]));

      const collected: any[] = [];
      let cursor = "";
      const maxToFetch = input.maxResults ?? Infinity; // no cap by default

      while (collected.length < maxToFetch) {
        const params = new URLSearchParams({ query, queryType: "Latest" });
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(
          `https://api.twitterapi.io/twitter/tweet/advanced_search?${params.toString()}`,
          { headers: { "X-API-Key": apiKey } }
        );

        if (!res.ok) {
          const body = await res.text();
          if (collected.length === 0) {
            return { success: false, reason: `TWITTERAPI_IO_ERROR_${res.status}`, message: `twitterapi.io error: ${body.slice(0, 300)}`, results: [] };
          }
          break; // partial results — stop paginating
        }

        const json = await res.json() as any;
        const tweets: any[] = json?.tweets ?? [];
        if (tweets.length === 0) break;

        for (const tweet of tweets) {
          if (collected.length >= maxToFetch) break;
          const author = tweet.author ?? {};
          const handle = (author.userName ?? "").toLowerCase();
          const kolId = handleToKolId.get(handle) ?? null;
          collected.push({
            tweetId: tweet.id as string,
            authorHandle: author.userName ?? "",
            authorName: author.name ?? "",
            kolId,
            content: tweet.text as string,
            postedAt: tweet.createdAt ? new Date(tweet.createdAt) : null,
            language: tweet.lang as string,
            url: tweet.url ?? `https://x.com/${author.userName ?? "i"}/status/${tweet.id}`,
            likes: tweet.likeCount ?? 0,
            retweets: tweet.retweetCount ?? 0,
            replies: tweet.replyCount ?? 0,
            quotes: tweet.quoteCount ?? 0,
            impressions: tweet.viewCount ?? null,
            views: tweet.viewCount ?? null,
            bookmarks: tweet.bookmarkCount ?? null,
          });
        }

        if (!json.has_next_page || !json.next_cursor) break;
        cursor = json.next_cursor;
      }

      // Apply region filter (post-query, based on KOL region)
      let filtered = collected;
      if (input.regions && input.regions.length > 0) {
        const kolRegionMap = new Map(allKols.map(k => [k.id, k.region?.toLowerCase()]));
        filtered = collected.filter(r => {
          if (!r.kolId) return false;
          const region = kolRegionMap.get(r.kolId);
          return region && input.regions!.some(reg => region.includes(reg.toLowerCase()));
        });
      }

      // Log API usage: 15 credits per tweet
      await logApiUsage({
        operation: "search",
        itemCount: collected.length,
        context: input.keywords.join(" "),
      });

      // Auto-insert report tweets into KOL campaign posts + detect missing KOLs
      const { inserted: autoInserted, missingHandles } = await autoInsertReportTweets(filtered);

      return {
        success: true,
        results: filtered,
        query,
        totalFound: collected.length,
        autoInserted,
        missingHandles,
      };
    }),

  save: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(256),
      keywords: z.array(z.string()).min(1),
      keywordMode: z.enum(["AND", "OR"]).default("OR"),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      kolIds: z.array(z.number()).optional(),
      languages: z.array(z.string()).optional(),
      regions: z.array(z.string()).optional(),
      folderIds: z.array(z.number()).optional(),
      results: z.array(z.object({
        tweetId: z.string().optional(),
        authorHandle: z.string().optional(),
        authorName: z.string().optional(),
        kolId: z.number().nullable().optional(),
        content: z.string().optional(),
        postedAt: z.date().nullable().optional(),
        language: z.string().optional(),
        url: z.string().optional(),
        likes: z.number().optional(),
        retweets: z.number().optional(),
        replies: z.number().optional(),
        quotes: z.number().optional(),
        impressions: z.number().nullable().optional(),
        views: z.number().nullable().optional(),
        bookmarks: z.number().nullable().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const { results, ...reportData } = input;
      const reportId = await createReport({
        name: reportData.name,
        keywords: JSON.stringify(reportData.keywords),
        keywordMode: reportData.keywordMode,
        startDate: reportData.startDate,
        endDate: reportData.endDate,
        kolIds: reportData.kolIds ? JSON.stringify(reportData.kolIds) : null,
        languages: reportData.languages ? JSON.stringify(reportData.languages) : null,
        regions: reportData.regions ? JSON.stringify(reportData.regions) : null,
        folderIds: reportData.folderIds ? JSON.stringify(reportData.folderIds) : null,
        resultCount: results.length,
      });
      await saveReportResults(reportId, results.map(r => ({
        tweetId: r.tweetId,
        authorHandle: r.authorHandle,
        authorName: r.authorName,
        kolId: r.kolId ?? null,
        content: r.content,
        postedAt: r.postedAt ?? null,
        language: r.language,
        url: r.url,
        likes: r.likes ?? 0,
        retweets: r.retweets ?? 0,
        replies: r.replies ?? 0,
        quotes: r.quotes ?? 0,
        impressions: r.impressions ?? null,
        views: r.views ?? null,
        bookmarks: r.bookmarks ?? null,
      })));
      return { reportId };
    }),

  exportCsv: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const report = await getReportById(input.id);
      if (!report) throw new Error("Report not found");
      const results = await getReportResults(input.id);
      const headers = ["Tweet ID", "Author Handle", "Author Name", "Content", "Posted At", "Language", "Likes", "Retweets", "Replies", "Quotes", "Views", "Bookmarks", "URL"];
      const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = results.map(r => [
        escape(r.tweetId), escape(r.authorHandle), escape(r.authorName),
        escape(r.content), escape(r.postedAt ? new Date(r.postedAt).toISOString() : ""),
        escape(r.language), escape(r.likes), escape(r.retweets), escape(r.replies),
        escape(r.quotes), escape(r.views ?? ""), escape(r.bookmarks ?? ""), escape(r.url),
      ].join(","));
      return { csv: [headers.join(","), ...rows].join("\n"), filename: `${report.name.replace(/[^a-z0-9]/gi, "_")}.csv` };
    }),
});

// ─── Usage / Cost Tracker router ────────────────────────────────────────────

const usageRouter = router({
  getStats: protectedProcedure.query(() => getApiUsageStats()),
});

// ─── Campaign router ─────────────────────────────────────────────────────────

/** Extract tweet ID from a tweet URL like https://x.com/user/status/12345 */
function parseTweetId(url: string): string | null {
  const m = url.match(/\/status\/([0-9]+)/);
  return m ? m[1] : null;
}

/** Extract handle from a tweet URL */
function parseTweetHandle(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 1) return parts[0].toLowerCase();
  } catch { /* ignore */ }
  return null;
}

const campaignRouter = router({
  list: protectedProcedure.query(() => listCampaigns()),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const campaign = await getCampaignById(input.id);
      const posts = campaign ? await getCampaignPosts(input.id) : [];
      return { campaign, posts };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      budget: z.number().optional(),
      status: z.enum(["active", "completed", "draft"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await createCampaign({
        name: input.name,
        description: input.description,
        budget: input.budget != null ? String(input.budget) : undefined,
        status: input.status ?? "active",
      });
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      budget: z.number().nullable().optional(),
      status: z.enum(["active", "completed", "draft"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, budget, ...rest } = input;
      const data: any = { ...rest };
      if (budget !== undefined) data.budget = budget != null ? String(budget) : null;
      await updateCampaign(id, data);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteCampaign(input.id);
      return { success: true };
    }),

  // Import a batch of tweet URLs, optionally with per-post budgets
  importUrls: protectedProcedure
    .input(z.object({
      campaignId: z.number(),
      urls: z.array(z.object({
        url: z.string().min(1),
        budget: z.number().optional(),
      })).min(1),
    }))
    .mutation(async ({ input }) => {
      const inserted: number[] = [];
      for (const item of input.urls) {
        const tweetId = parseTweetId(item.url);
        const kolHandle = parseTweetHandle(item.url);
        const id = await insertCampaignPost({
          campaignId: input.campaignId,
          tweetUrl: item.url,
          tweetId: tweetId ?? undefined,
          kolHandle: kolHandle ?? undefined,
          budget: item.budget != null ? String(item.budget) : undefined,
          fetchStatus: "pending",
        });
        inserted.push(id);
      }
      return { inserted: inserted.length };
    }),

  // Fetch metrics for all posts in a campaign from twitterapi.io (re-fetches all, not just pending)
  fetchMetrics: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ input }) => {
      const posts = await getCampaignPosts(input.campaignId);
      // Re-fetch ALL posts (pending + done + failed) — always get fresh metrics
      const toFetch = posts.filter(p => p.tweetId);
      let done = 0;
      let failed = 0;
      const apiKey = ENV.twitterApiIoKey;
      if (!apiKey) throw new Error("twitterapi_io_key not configured");

      const affectedKolIds = new Set<number>();
      const missingHandles = new Set<string>();

      for (const post of toFetch) {
        try {
          // Best approach: search from:handle with since_id/max_id bracket
          // Fallback: search by tweet ID in URL
          let tweet: any = null;

          if (post.kolHandle) {
            // Primary: search from:handle filtered to exact tweet ID range
            // Subtract 1 from tweet ID string for since_id bracket
            const sinceId = String(Number(post.tweetId!) - 1);
            const q = encodeURIComponent(`from:${post.kolHandle} since_id:${sinceId} max_id:${post.tweetId}`);
            const res = await fetchWithRetry(
              `https://api.twitterapi.io/twitter/tweet/advanced_search?query=${q}&queryType=Latest&count=1`,
              { headers: { "X-API-Key": apiKey } }
            );
            if (res.ok) {
              const json = await res.json() as any;
              tweet = json?.tweets?.find((t: any) => String(t.id) === String(post.tweetId))
                ?? (json?.tweets?.length === 1 ? json.tweets[0] : null);
            }
          }

          // Fallback: search by URL containing the tweet ID
          if (!tweet) {
            const q2 = encodeURIComponent(`url:${post.tweetId}`);
            const res2 = await fetchWithRetry(
              `https://api.twitterapi.io/twitter/tweet/advanced_search?query=${q2}&queryType=Latest&count=1`,
              { headers: { "X-API-Key": apiKey } }
            );
            if (res2.ok) {
              const j2 = await res2.json() as any;
              tweet = j2?.tweets?.find((t: any) => String(t.id) === String(post.tweetId))
                ?? (j2?.tweets?.length > 0 ? j2.tweets[0] : null);
            }
          }

          if (!tweet) throw new Error("Tweet not found");

          // twitterapi.io uses flat camelCase field names
          const updates: any = {
            likes: tweet.likeCount ?? 0,
            retweets: tweet.retweetCount ?? 0,
            replies: tweet.replyCount ?? 0,
            quotes: tweet.quoteCount ?? 0,
            views: tweet.viewCount ?? null,
            bookmarks: tweet.bookmarkCount ?? null,
            tweetText: tweet.text ?? null,
            fetchStatus: "done" as const,
            fetchError: null,
            fetchedAt: new Date(),
          };

          // Match KOL by handle
          if (post.kolHandle) {
            const allKols = await listKols();
            const matched = allKols.find(k => k.handle?.toLowerCase() === post.kolHandle?.toLowerCase());
            if (matched) {
              updates.kolId = matched.id;
              affectedKolIds.add(matched.id);
            } else {
              missingHandles.add(post.kolHandle);
            }
          }
          if (post.kolId) affectedKolIds.add(post.kolId);

          await updateCampaignPost(post.id, updates);
          await logApiUsage({ operation: "campaign_fetch", itemCount: 1, context: `campaign:${input.campaignId}` });
          done++;
        } catch (err: any) {
          await updateCampaignPost(post.id, { fetchStatus: "failed", fetchError: String(err?.message ?? err) });
          failed++;
        }
      }

      // Recalculate avg metrics for all affected KOLs
      for (const kolId of affectedKolIds) {
        await recalcKolMetrics(kolId);
      }

      return { done, failed, total: toFetch.length, missingHandles: [...missingHandles] };
    }),

  updatePost: protectedProcedure
    .input(z.object({
      id: z.number(),
      budget: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, budget } = input;
      const data: any = {};
      if (budget !== undefined) data.budget = budget != null ? String(budget) : null;
      await updateCampaignPost(id, data);
      return { success: true };
    }),

  deletePost: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteCampaignPost(input.id);
      return { success: true };
    }),

  // Get all campaign posts for a specific KOL (for KOL profile page)
  getKolPosts: protectedProcedure
    .input(z.object({ kolId: z.number() }))
    .query(({ input }) => getKolCampaignPosts(input.kolId)),
});

// ─── App router ───────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  kol: kolRouter,
  folder: folderRouter,
  report: reportRouter,
  usage: usageRouter,
  campaign: campaignRouter,
});

export type AppRouter = typeof appRouter;

// ─── twitterapi.io enrichment helper ─────────────────────────────────────────

/** Fetch with automatic retry on 429 (up to 3 attempts, 6s backoff) */
async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    if (attempt < retries - 1) {
      // Retry-After header or default 6s
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "6", 10);
      await new Promise(r => setTimeout(r, (retryAfter + 1) * 1000));
    } else {
      return res; // return the 429 on final attempt
    }
  }
  throw new Error("fetchWithRetry: exhausted retries");
}

async function enrichSingleKol(
  id: number,
  handle: string,
  apiKey: string
): Promise<{ success: boolean; reason?: string; message?: string }> {
  try {
    await updateKolEnrichment(id, { enrichmentStatus: "pending" });

    // 1. Fetch user profile via twitterapi.io
    const userUrl = `https://api.twitterapi.io/twitter/user/info?userName=${encodeURIComponent(handle)}`;
    const userRes = await fetchWithRetry(userUrl, { headers: { "X-API-Key": apiKey } });
    if (!userRes.ok) {
      const body = await userRes.text();
      await updateKolEnrichment(id, { enrichmentStatus: "failed" });
      return { success: false, reason: `TWITTERAPI_IO_ERROR_${userRes.status}`, message: `twitterapi.io returned ${userRes.status}: ${body.slice(0, 200)}` };
    }
    const userJson = await userRes.json() as any;
    // twitterapi.io returns user object directly (not nested under .data)
    const user = userJson?.data ?? userJson;
    if (!user || !user.userName) {
      await updateKolEnrichment(id, { enrichmentStatus: "failed" });
      return { success: false, reason: "USER_NOT_FOUND", message: `@${handle} not found on X` };
    }

    // 2. Fetch recent tweets mentioning @AethirCloud (fallback to general timeline)
    // twitterapi.io advanced search — no 7-day limit
    let tweets: any[] = [];
    try {
      const aethirQuery = `from:${handle} @AethirCloud -is:retweet`;
      const searchParams = new URLSearchParams({ query: aethirQuery, queryType: "Latest" });
      const searchRes = await fetchWithRetry(
        `https://api.twitterapi.io/twitter/tweet/advanced_search?${searchParams.toString()}`,
        { headers: { "X-API-Key": apiKey } }
      );
      if (searchRes.ok) {
        const searchJson = await searchRes.json() as any;
        tweets = (searchJson?.tweets ?? []).slice(0, 10);
      }
    } catch (_) {}
    // Fallback: general recent tweets
    if (tweets.length === 0) {
      try {
        const tlParams = new URLSearchParams({ userName: handle });
        const tlRes = await fetchWithRetry(
          `https://api.twitterapi.io/twitter/user/last_tweets?${tlParams.toString()}`,
          { headers: { "X-API-Key": apiKey } }
        );
        if (tlRes.ok) {
          const tlJson = await tlRes.json() as any;
          tweets = (tlJson?.tweets ?? []).slice(0, 10);
        }
      } catch (_) {}
    }

    // 3. Compute engagement averages from tweets
    // twitterapi.io fields: likeCount, retweetCount, replyCount, quoteCount, viewCount
    let avgLikes: number | undefined;
    let avgRetweets: number | undefined;
    let avgReplies: number | undefined;
    let postLanguage: string | undefined;
    if (tweets.length > 0) {
      const totalLikes = tweets.reduce((s: number, t: any) => s + (t.likeCount ?? 0), 0);
      const totalRetweets = tweets.reduce((s: number, t: any) => s + (t.retweetCount ?? 0), 0);
      const totalReplies = tweets.reduce((s: number, t: any) => s + (t.replyCount ?? 0), 0);
      avgLikes = Math.round((totalLikes / tweets.length) * 100) / 100;
      avgRetweets = Math.round((totalRetweets / tweets.length) * 100) / 100;
      avgReplies = Math.round((totalReplies / tweets.length) * 100) / 100;
      // Majority language
      const langCounts: Record<string, number> = {};
      for (const t of tweets) { const l = t.lang; if (l && l !== 'und') langCounts[l] = (langCounts[l] ?? 0) + 1; }
      const sortedLangs = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
      postLanguage = sortedLangs[0]?.[0];
    }

    // 4. Compute engagement rate
    const followerCount = user.followers ?? 0;
    let engagementRate: number | undefined;
    if (followerCount > 0 && tweets.length > 0) {
      const totalEng = tweets.reduce((s: number, t: any) => {
        return s + (t.likeCount ?? 0) + (t.retweetCount ?? 0) + (t.replyCount ?? 0) + (t.quoteCount ?? 0);
      }, 0);
      engagementRate = Math.round((totalEng / tweets.length / followerCount) * 10000) / 100;
    }

    // 5. Normalize location via LLM
    let normalizedRegion: string | undefined;
    const rawLocation = user.location;
    if (rawLocation) {
      try {
        const { invokeLLM } = await import("./_core/llm");
        const llmRes = await invokeLLM({
          messages: [
            { role: "system", content: "You are a location normalizer. Given a raw location string from a social media profile, return ONLY the country name in English (e.g. 'South Korea', 'Turkey', 'India', 'United States'). If you cannot determine the country, return 'Unknown'. Return nothing else." },
            { role: "user", content: rawLocation },
          ],
        });
        const rawContent = llmRes?.choices?.[0]?.message?.content;
        const country = typeof rawContent === 'string' ? rawContent.trim() : undefined;
        if (country && country !== 'Unknown') normalizedRegion = country;
      } catch (_) {}
    }

    // 6. Verified status — twitterapi.io uses isBlueVerified + verifiedType
    let verifiedStatus: string = "none";
    if (user.verifiedType) verifiedStatus = user.verifiedType;
    else if (user.isBlueVerified === true) verifiedStatus = "blue";

    // 7. Account created at
    const accountCreatedAt = user.createdAt ? new Date(user.createdAt) : undefined;

    // 8. Profile image — use original size (remove _normal suffix)
    const profileImageUrl = user.profilePicture
      ? (user.profilePicture as string).replace(/_normal\./, '.')
      : undefined;

    // 9. Write all fields
    await updateKol(id, {
      displayName: user.name ?? undefined,
      followers: user.followers ?? undefined,
      profileUrl: `https://x.com/${handle}`,
      platform: "X",
      profileBio: user.description ?? undefined,
      profileImageUrl,
      postLanguage,
      accountCreatedAt,
      verified: verifiedStatus,
      avgLikes,
      avgRetweets,
      avgReplies,
      ...(engagementRate !== undefined ? { engagementRate } : {}),
      ...(normalizedRegion ? { region: normalizedRegion } : {}),
    });
    await updateKolEnrichment(id, { enrichmentStatus: "done", enrichedAt: new Date() });
    // Log API usage: 18 credits for profile, 15 credits per tweet
    await logApiUsage({ operation: "enrich_profile", itemCount: 1, context: `@${handle}` });
    if (tweets.length > 0) {
      await logApiUsage({ operation: "enrich_timeline", itemCount: tweets.length, context: `@${handle}` });
    }
    return { success: true };
  } catch (e: any) {
    await updateKolEnrichment(id, { enrichmentStatus: "failed" });
    return { success: false, reason: "EXCEPTION", message: e.message };
  }
}

// ─── Campaign CSV handle→posts re-parser ─────────────────────────────────────

function parseCSVWithHandleMap(csvText: string, sourceLabel?: string): {
  postsByHandle: Map<string, InsertKolPost[]>;
} {
  const lines = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const source = sourceLabel ?? "manual_import";
  const postsByHandle = new Map<string, InsertKolPost[]>();

  const { detectFormat } = require("./csvIntake");
  const { format, headerLineIndex } = detectFormat(lines);

  if (format !== "CAMPAIGN_INDIA" && format !== "CAMPAIGN_KOREA_NOVDEC" && format !== "CAMPAIGN_KOREA_JAN") {
    return { postsByHandle };
  }

  function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ""; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseCsvLine(lines[headerLineIndex]).map(h => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim(); if (!line) continue;
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });
    rows.push(row);
  }

  function parseNum(s?: string): number | undefined {
    if (!s || s.trim() === "" || s.trim() === "-") return undefined;
    const n = parseFloat(s.replace(/,/g, "").replace(/\$/g, "").trim());
    return isNaN(n) ? undefined : n;
  }
  function parseIntVal(s?: string): number | undefined { const n = parseNum(s); return n !== undefined ? Math.round(n) : undefined; }
  function parseER(s?: string): number | undefined {
    if (!s || s.trim() === "") return undefined;
    const n = parseFloat(s.replace(/%/g, "").trim());
    return isNaN(n) ? undefined : Math.round(n * 10000) / 10000;
  }
  function inferPlatform(url?: string, fallback = "X"): string {
    if (!url) return fallback;
    if (url.includes("x.com") || url.includes("twitter.com")) return "X";
    if (url.includes("t.me") || url.includes("telegram")) return "Telegram";
    return fallback;
  }

  for (const row of rows) {
    const channelName = row["Channel Name"]?.trim(); if (!channelName) continue;
    if (!postsByHandle.has(channelName)) postsByHandle.set(channelName, []);
    if (format === "CAMPAIGN_INDIA") {
      const postUrl = row["Post Link"]?.trim() || undefined;
      postsByHandle.get(channelName)!.push({
        kolId: 0, postUrl, platform: inferPlatform(postUrl, "X"),
        postDate: row["Month"]?.trim() || undefined, postTitle: row["Topic"]?.trim() || undefined,
        topic: row["Topic"]?.trim() || undefined, postType: row["Format"]?.trim() || undefined,
        campaignRegion: "India", campaignSubject: row["Topic"]?.trim() || undefined,
        views: parseIntVal(row["Views"]), impressions: undefined, likes: parseIntVal(row["Likes"]),
        comments: parseIntVal(row["Comment"]), reposts: parseIntVal(row["Repost"]),
        quotes: undefined, bookmarks: parseIntVal(row["Bookmark"]),
        totalEngagement: parseIntVal(row["Total Engagement"]), engagementRate: parseER(row["Engagement Rate"]),
        result: row["Status"]?.trim() || undefined, featuredReview: row["Featured Reviews"]?.trim() || undefined,
        costPerPost: parseNum(row["Cost per post"]), cpm: parseNum(row["CPM"]),
        walletAddress: undefined, txId: undefined, paid: undefined, source,
      });
    } else {
      const postUrl = row["Link"]?.trim() || undefined;
      postsByHandle.get(channelName)!.push({
        kolId: 0, postUrl, platform: row["Platform"]?.trim() || inferPlatform(postUrl, "Telegram"),
        postDate: row["Date"]?.trim() || undefined, postTitle: row["Title"]?.trim() || undefined,
        topic: row["Subject"]?.trim() || undefined, postType: row["Type"]?.trim() || undefined,
        campaignRegion: "Korea", campaignSubject: row["Subject"]?.trim() || undefined,
        views: parseIntVal(row["Views"]), impressions: undefined,
        likes: undefined, comments: undefined, reposts: undefined, quotes: undefined,
        bookmarks: undefined, totalEngagement: undefined, engagementRate: undefined,
        result: row["Result"]?.trim() || undefined, featuredReview: undefined,
        costPerPost: parseNum(row["Budget"]), cpm: undefined,
        walletAddress: row["EVM"]?.trim() || undefined, txId: row["TXID"]?.trim() || undefined,
        paid: row["Paid"]?.trim() || undefined, source,
      });
    }
  }
  return { postsByHandle };
}
