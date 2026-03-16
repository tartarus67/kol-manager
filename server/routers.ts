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
} from "./db";
import { parseCSV } from "./csvIntake";
import { InsertKolPost } from "../drizzle/schema";

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
      return { kol, posts };
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

  // CSV import: accepts raw CSV text, detects format, parses, inserts
  importCsv: protectedProcedure
    .input(z.object({
      csvText: z.string(),
      sourceLabel: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = parseCSV(input.csvText, input.sourceLabel);

      if (result.format === "UNKNOWN") {
        return {
          success: false,
          format: "UNKNOWN",
          kolsInserted: 0,
          postsInserted: 0,
          warnings: result.warnings,
        };
      }

      // Build handle → posts map for campaign-style formats
      const postsByHandle = new Map<string, InsertKolPost[]>();

      if (result.posts.length > 0) {
        // For campaign formats, posts are ordered to match kols by index
        // We need to re-associate them. The parsers set kolId=0 as placeholder.
        // Re-associate by matching post source order to kol order.
        // Since parsers deduplicate kols and collect posts per channel,
        // we rebuild the map by re-running the association logic from the parsed data.
        // The cleanest approach: re-parse to get the handle→posts mapping.
        const reparse = parseCSVWithHandleMap(input.csvText, input.sourceLabel);
        Array.from(reparse.postsByHandle.entries()).forEach(([handle, posts]) => {
          postsByHandle.set(handle, posts);
        });
      }

      const { kolsInserted, postsInserted } = await bulkImportWithPosts(
        result.kols,
        postsByHandle
      );

      return {
        success: true,
        format: result.format,
        kolsInserted,
        postsInserted,
        warnings: result.warnings,
      };
    }),

  // Preview: parse CSV and return what would be imported, without inserting
  previewCsv: protectedProcedure
    .input(z.object({ csvText: z.string() }))
    .mutation(({ input }) => {
      const result = parseCSV(input.csvText);
      return {
        format: result.format,
        kolCount: result.kols.length,
        postCount: result.posts.length,
        warnings: result.warnings,
        sample: result.kols.slice(0, 5),
      };
    }),
});

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
});

export type AppRouter = typeof appRouter;

// ─── Internal helper: re-parse to get handle→posts map ───────────────────────

function parseCSVWithHandleMap(csvText: string, sourceLabel?: string): {
  postsByHandle: Map<string, InsertKolPost[]>;
} {
  const lines = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const source = sourceLabel ?? "manual_import";
  const postsByHandle = new Map<string, InsertKolPost[]>();

  // Import inline to avoid circular dep issues
  const { detectFormat } = require("./csvIntake");
  const { format, headerLineIndex } = detectFormat(lines);

  if (format !== "CAMPAIGN_INDIA" && format !== "CAMPAIGN_KOREA_NOVDEC" && format !== "CAMPAIGN_KOREA_JAN") {
    return { postsByHandle };
  }

  // Parse rows
  function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim()); current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headerLine = lines[headerLineIndex];
  const headers = parseCsvLine(headerLine).map(h => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });
    rows.push(row);
  }

  function parseNum(s: string | undefined): number | undefined {
    if (!s || s.trim() === "" || s.trim() === "-") return undefined;
    const n = parseFloat(s.replace(/,/g, "").replace(/\$/g, "").trim());
    return isNaN(n) ? undefined : n;
  }
  function parseIntVal(s: string | undefined): number | undefined {
    const n = parseNum(s); return n !== undefined ? Math.round(n) : undefined;
  }
  function parseER(s: string | undefined): number | undefined {
    if (!s || s.trim() === "") return undefined;
    const n = parseFloat(s.replace(/%/g, "").trim());
    return isNaN(n) ? undefined : Math.round(n * 10000) / 10000;
  }
  function inferPlatform(url: string | undefined, fallback = "X"): string {
    if (!url) return fallback;
    if (url.includes("x.com") || url.includes("twitter.com")) return "X";
    if (url.includes("t.me") || url.includes("telegram")) return "Telegram";
    return fallback;
  }

  for (const row of rows) {
    const channelName = row["Channel Name"]?.trim();
    if (!channelName) continue;

    if (!postsByHandle.has(channelName)) postsByHandle.set(channelName, []);

    if (format === "CAMPAIGN_INDIA") {
      const postUrl = row["Post Link"]?.trim() || undefined;
      postsByHandle.get(channelName)!.push({
        kolId: 0,
        postUrl,
        platform: inferPlatform(postUrl, "X"),
        postDate: row["Month"]?.trim() || undefined,
        postTitle: row["Topic"]?.trim() || undefined,
        topic: row["Topic"]?.trim() || undefined,
        postType: row["Format"]?.trim() || undefined,
        campaignRegion: "India",
        campaignSubject: row["Topic"]?.trim() || undefined,
        views: parseIntVal(row["Views"]),
        impressions: undefined,
        likes: parseIntVal(row["Likes"]),
        comments: parseIntVal(row["Comment"]),
        reposts: parseIntVal(row["Repost"]),
        quotes: undefined,
        bookmarks: parseIntVal(row["Bookmark"]),
        totalEngagement: parseIntVal(row["Total Engagement"]),
        engagementRate: parseER(row["Engagement Rate"]),
        result: row["Status"]?.trim() || undefined,
        featuredReview: row["Featured Reviews"]?.trim() || undefined,
        costPerPost: parseNum(row["Cost per post"]),
        cpm: parseNum(row["CPM"]),
        walletAddress: undefined,
        txId: undefined,
        paid: undefined,
        source,
      });
    } else {
      // Korea formats
      const postUrl = row["Link"]?.trim() || undefined;
      postsByHandle.get(channelName)!.push({
        kolId: 0,
        postUrl,
        platform: row["Platform"]?.trim() || inferPlatform(postUrl, "Telegram"),
        postDate: row["Date"]?.trim() || undefined,
        postTitle: row["Title"]?.trim() || undefined,
        topic: row["Subject"]?.trim() || undefined,
        postType: row["Type"]?.trim() || undefined,
        campaignRegion: "Korea",
        campaignSubject: row["Subject"]?.trim() || undefined,
        views: parseIntVal(row["Views"]),
        impressions: undefined,
        likes: undefined,
        comments: undefined,
        reposts: undefined,
        quotes: undefined,
        bookmarks: undefined,
        totalEngagement: undefined,
        engagementRate: undefined,
        result: row["Result"]?.trim() || undefined,
        featuredReview: undefined,
        costPerPost: parseNum(row["Budget"]),
        cpm: undefined,
        walletAddress: row["EVM"]?.trim() || undefined,
        txId: row["TXID"]?.trim() || undefined,
        paid: row["Paid"]?.trim() || undefined,
        source,
      });
    }
  }

  return { postsByHandle };
}
