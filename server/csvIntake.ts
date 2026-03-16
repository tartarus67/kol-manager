/**
 * CSV Intake Engine
 *
 * Detects the format of an incoming CSV and maps its columns to the
 * canonical KOL schema. Supports:
 *
 *   FORMAT_COOKIE3_NOVA     — Nova ALL TIME Performance (Cookie3 export, header on row 1)
 *   FORMAT_COOKIE3_TURKISH  — Turkish KOL Masterlist (Cookie3 export, has Smart Followers)
 *   FORMAT_CAMPAIGN_INDIA   — India KOL Posts Tracking (post-level, platform inferred from URL)
 *   FORMAT_CAMPAIGN_KOREA   — Korea KOL Tracker Nov~Dec 2025 (post-level, 2 blank header rows)
 *   FORMAT_CAMPAIGN_KOREA2  — Korea KOL Tracker Jan~Dec 2026 (post-level, header on row 0)
 *
 * All formats produce { kols: InsertKol[], posts: InsertKolPost[] }.
 * Post-tracker formats deduplicate KOLs by Channel Name and collect all
 * posts under each unique KOL.
 */

import { InsertKol, InsertKolPost } from "../drizzle/schema";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ParsedRow = Record<string, string>;

export type IntakeResult = {
  format: string;
  kols: InsertKol[];
  posts: InsertKolPost[];
  warnings: string[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNum(s: string | undefined): number | undefined {
  if (!s || s.trim() === "" || s.trim() === "-") return undefined;
  const cleaned = s.replace(/,/g, "").replace(/\$/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? undefined : n;
}

function parseIntVal(s: string | undefined): number | undefined {
  const n = parseNum(s);
  return n !== undefined ? Math.round(n) : undefined;
}

function parseEngagementRate(s: string | undefined): number | undefined {
  if (!s || s.trim() === "" || s.trim() === "-") return undefined;
  const cleaned = s.replace(/%/g, "").trim();
  const n = parseFloat(cleaned);
  if (isNaN(n)) return undefined;
  return Math.round(n * 10000) / 10000; // 4 decimal places
}

function inferPlatform(url: string | undefined, fallback = "X"): string {
  if (!url) return fallback;
  if (url.includes("x.com") || url.includes("twitter.com")) return "X";
  if (url.includes("t.me") || url.includes("telegram")) return "Telegram";
  if (url.includes("youtube")) return "YouTube";
  return fallback;
}

function normalizeHandle(raw: string): string {
  return raw.replace(/^@/, "").trim();
}

// ─── Format Detection ─────────────────────────────────────────────────────────
//
// We detect format by inspecting the first few lines for known column signatures.

type CsvFormat =
  | "COOKIE3_NOVA"
  | "COOKIE3_TURKISH"
  | "CAMPAIGN_INDIA"
  | "CAMPAIGN_KOREA_NOVDEC"
  | "CAMPAIGN_KOREA_JAN"
  | "UNKNOWN";

export function detectFormat(lines: string[]): { format: CsvFormat; headerLineIndex: number } {
  // Scan first 5 lines for known header signatures
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i].toLowerCase();

    // Cookie3 Nova: has "kol username" and "average engagement" but NOT "smart followers"
    if (line.includes("kol username") && line.includes("average engagement") && !line.includes("smart followers")) {
      return { format: "COOKIE3_NOVA", headerLineIndex: i };
    }

    // Cookie3 Turkish: has "kol username" AND "smart followers"
    if (line.includes("kol username") && line.includes("smart followers")) {
      return { format: "COOKIE3_TURKISH", headerLineIndex: i };
    }

    // India campaign tracker: has "channel name" + "billing cycle" + "cost per post"
    if (line.includes("channel name") && line.includes("billing cycle")) {
      return { format: "CAMPAIGN_INDIA", headerLineIndex: i };
    }

    // Korea Nov~Dec: has "channel name" + "bsc" column (blockchain payment)
    if (line.includes("channel name") && line.includes("bsc") && line.includes("evm")) {
      return { format: "CAMPAIGN_KOREA_NOVDEC", headerLineIndex: i };
    }

    // Korea Jan~Dec: has "channel name" + "evm" but NOT "bsc"
    if (line.includes("channel name") && line.includes("evm") && !line.includes("bsc")) {
      return { format: "CAMPAIGN_KOREA_JAN", headerLineIndex: i };
    }
  }

  return { format: "UNKNOWN", headerLineIndex: 0 };
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseRows(lines: string[], headerLineIndex: number): ParsedRow[] {
  const headerLine = lines[headerLineIndex];
  const headers = parseCsvLine(headerLine).map(h => h.trim());

  const rows: ParsedRow[] = [];
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: ParsedRow = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

// ─── Format-specific parsers ──────────────────────────────────────────────────

function parseCookie3Nova(rows: ParsedRow[], source: string): IntakeResult {
  const kols: InsertKol[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    const handle = normalizeHandle(row["KOL Username"] ?? "");
    if (!handle) continue;

    kols.push({
      handle,
      displayName: row["KOL Display Name"]?.trim() || handle,
      platform: "X",
      profileUrl: row["URL"]?.trim() || undefined,
      followers: parseIntVal(row["Followers"]),
      smartFollowers: undefined,
      engagementRate: parseEngagementRate(row["Engagement Rate %"]),
      avgEngagement: parseNum(row["Average Engagement"]),
      avgImpressions: parseNum(row["Average Post Impressions"]),
      score: parseNum(row["Score"]),
      tier: undefined,
      region: "Nova",
      category: undefined,
      contentType: undefined,
      contentFormat: undefined,
      tags: undefined,
      costPerPost: undefined,
      status: "active",
      source,
      notes: [
        row["Posts"] ? `Posts tracked: ${row["Posts"]}` : null,
        row["Impressions"] ? `Total impressions: ${row["Impressions"]}` : null,
        row["Total time on top"] ? `Time on top: ${row["Total time on top"]}` : null,
      ].filter(Boolean).join(" | ") || undefined,
    });
  }

  return { format: "COOKIE3_NOVA", kols, posts: [], warnings };
}

function parseCookie3Turkish(rows: ParsedRow[], source: string): IntakeResult {
  const kols: InsertKol[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    const handle = normalizeHandle(row["KOL Username"] ?? "");
    if (!handle) continue;

    kols.push({
      handle,
      displayName: row["KOL Display Name"]?.trim() || handle,
      platform: "X",
      profileUrl: row["URL"]?.trim() || undefined,
      followers: parseIntVal(row["Followers"]),
      smartFollowers: parseIntVal(row["Smart Followers"]),
      engagementRate: parseEngagementRate(row["Engagement Rate %"]),
      avgEngagement: parseNum(row["Average Engagement"]),
      avgImpressions: parseNum(row["Average Post Impressions"]),
      score: parseNum(row["Score"]),
      tier: undefined,
      region: "Turkey",
      category: undefined,
      contentType: undefined,
      contentFormat: undefined,
      tags: undefined,
      costPerPost: undefined,
      status: "active",
      source,
      notes: [
        row["Posts"] ? `Posts tracked: ${row["Posts"]}` : null,
        row["Impressions"] ? `Total impressions: ${row["Impressions"]}` : null,
        row["Total time on top"] ? `Time on top: ${row["Total time on top"]}` : null,
      ].filter(Boolean).join(" | ") || undefined,
    });
  }

  return { format: "COOKIE3_TURKISH", kols, posts: [], warnings };
}

function parseCampaignIndia(rows: ParsedRow[], source: string): IntakeResult {
  const kolMap = new Map<string, InsertKol>();
  const posts: InsertKolPost[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    const channelName = row["Channel Name"]?.trim();
    if (!channelName) continue;

    const postUrl = row["Post Link"]?.trim() || undefined;
    const platform = inferPlatform(postUrl, "X");

    // Upsert KOL — first occurrence wins for profile fields
    if (!kolMap.has(channelName)) {
      kolMap.set(channelName, {
        handle: channelName,
        displayName: channelName,
        platform,
        profileUrl: row["Link"]?.trim() || undefined,
        followers: parseIntVal(row["Followers"]),
        smartFollowers: undefined,
        engagementRate: undefined, // will aggregate from posts
        avgEngagement: undefined,
        avgImpressions: undefined,
        score: undefined,
        tier: undefined,
        region: "India",
        category: undefined,
        contentType: row["Format"]?.trim() || undefined,
        contentFormat: row["Format"]?.trim() || undefined,
        tags: undefined,
        costPerPost: parseNum(row["Cost per post"]),
        status: "active",
        source,
        notes: undefined,
      });
    }

    // Always record the post
    posts.push({
      kolId: 0, // placeholder — resolved after KOL insert
      postUrl,
      platform,
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
      engagementRate: parseEngagementRate(row["Engagement Rate"]),
      result: row["Status"]?.trim() || undefined,
      featuredReview: row["Featured Reviews"]?.trim() || undefined,
      costPerPost: parseNum(row["Cost per post"]),
      cpm: parseNum(row["CPM"]),
      walletAddress: undefined,
      txId: undefined,
      paid: undefined,
      source,
    });
  }

  return {
    format: "CAMPAIGN_INDIA",
    kols: Array.from(kolMap.values()),
    posts,
    warnings,
  };
}

function parseCampaignKorea(rows: ParsedRow[], source: string, hasBosc: boolean): IntakeResult {
  const kolMap = new Map<string, InsertKol>();
  const posts: InsertKolPost[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    const channelName = row["Channel Name"]?.trim();
    if (!channelName) continue;

    const postUrl = row["Link"]?.trim() || undefined;
    const platform = row["Platform"]?.trim() || inferPlatform(postUrl, "Telegram");
    const category = row["Categories"]?.trim() || undefined;
    const tier = row["Tier"]?.trim() || undefined;

    if (!kolMap.has(channelName)) {
      kolMap.set(channelName, {
        handle: channelName,
        displayName: channelName,
        platform,
        profileUrl: undefined,
        followers: parseIntVal(row["Followers"]),
        smartFollowers: undefined,
        engagementRate: undefined,
        avgEngagement: undefined,
        avgImpressions: undefined,
        score: undefined,
        tier,
        region: "Korea",
        category,
        contentType: row["Type"]?.trim() || undefined,
        contentFormat: undefined,
        tags: undefined,
        costPerPost: parseNum(row["Budget"]),
        status: "active",
        source,
        notes: undefined,
      });
    }

    posts.push({
      kolId: 0,
      postUrl,
      platform,
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

  return {
    format: hasBosc ? "CAMPAIGN_KOREA_NOVDEC" : "CAMPAIGN_KOREA_JAN",
    kols: Array.from(kolMap.values()),
    posts,
    warnings,
  };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export function parseCSV(csvText: string, sourceLabel?: string): IntakeResult {
  // Normalize line endings
  const lines = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const source = sourceLabel ?? "manual_import";

  const { format, headerLineIndex } = detectFormat(lines);

  if (format === "UNKNOWN") {
    return {
      format: "UNKNOWN",
      kols: [],
      posts: [],
      warnings: [
        "Could not detect CSV format. Supported formats: Cookie3 aggregate (Nova/Turkish), India campaign tracker, Korea campaign tracker.",
      ],
    };
  }

  const rows = parseRows(lines, headerLineIndex);
  // Filter out completely empty rows
  const validRows = rows.filter(r => Object.values(r).some(v => v.trim() !== ""));

  switch (format) {
    case "COOKIE3_NOVA":
      return parseCookie3Nova(validRows, source);
    case "COOKIE3_TURKISH":
      return parseCookie3Turkish(validRows, source);
    case "CAMPAIGN_INDIA":
      return parseCampaignIndia(validRows, source);
    case "CAMPAIGN_KOREA_NOVDEC":
      return parseCampaignKorea(validRows, source, true);
    case "CAMPAIGN_KOREA_JAN":
      return parseCampaignKorea(validRows, source, false);
    default:
      return { format: "UNKNOWN", kols: [], posts: [], warnings: ["Unhandled format."] };
  }
}
