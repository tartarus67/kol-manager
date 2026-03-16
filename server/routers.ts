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
      const rawKey = ENV.xApiBearerToken;
      console.log('[ENRICH DEBUG] rawKey present:', !!rawKey, '| length:', rawKey?.length, '| process.env key present:', !!process.env.X_API_BEARER_TOKEN);
      if (!rawKey) {
        return { success: false, reason: "X_API_KEY_MISSING", message: "X API Bearer Token not configured. Add X_API_BEARER_TOKEN to your secrets to enable enrichment." };
      }
      const apiKey = decodeURIComponent(rawKey);
      return enrichSingleKol(kol.id, kol.handle, apiKey);
    }),

  enrichBulk: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      const rawKey = ENV.xApiBearerToken;
      if (!rawKey) {
        return { success: false, reason: "X_API_KEY_MISSING", message: "X API Bearer Token not configured.", enriched: 0, failed: 0 };
      }
      const apiKey = decodeURIComponent(rawKey);
      let enriched = 0; let failed = 0; const errors: string[] = [];
      for (const id of input.ids) {
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
});

export type AppRouter = typeof appRouter;

// ─── X API enrichment helper ──────────────────────────────────────────────────

async function enrichSingleKol(
  id: number,
  handle: string,
  bearerToken: string
): Promise<{ success: boolean; reason?: string; message?: string }> {
  try {
    await updateKolEnrichment(id, { enrichmentStatus: "pending" });
    const url = `https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=public_metrics,description,profile_image_url,url`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${bearerToken}` } });
    if (!res.ok) {
      const body = await res.text();
      await updateKolEnrichment(id, { enrichmentStatus: "failed" });
      return { success: false, reason: `X_API_ERROR_${res.status}`, message: `X API returned ${res.status}: ${body.slice(0, 200)}` };
    }
    const json = await res.json() as any;
    const user = json?.data;
    if (!user) {
      await updateKolEnrichment(id, { enrichmentStatus: "failed" });
      return { success: false, reason: "USER_NOT_FOUND", message: `@${handle} not found on X` };
    }
    const metrics = user.public_metrics ?? {};
    await updateKol(id, {
      displayName: user.name ?? undefined,
      followers: metrics.followers_count ?? undefined,
      profileUrl: `https://x.com/${handle}`,
      platform: "X",
    });
    await updateKolEnrichment(id, { enrichmentStatus: "done", enrichedAt: new Date() });
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
