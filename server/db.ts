import { eq, like, or, and, inArray, SQL, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  kols, kolPosts, folders, kolFolders,
  reports, reportResults, apiUsage,
  campaigns, campaignPosts,
  savedSearches,
  InsertKol, InsertKolPost, InsertFolder, InsertReport, InsertReportResult,
  InsertCampaign, InsertCampaignPost, InsertSavedSearch,
  Kol, KolPost, Folder, KolFolder, Report, ReportResult, ApiUsage,
  Campaign, CampaignPost, SavedSearch,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot get user: database not available"); return undefined; }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── KOL helpers ─────────────────────────────────────────────────────────────

export async function listKols(search?: string, category?: string, region?: string): Promise<Kol[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: SQL[] = [];
  if (search) {
    conditions.push(
      or(
        like(kols.handle, `%${search}%`),
        like(kols.displayName, `%${search}%`)
      )!
    );
  }
  if (category && category !== "all") conditions.push(eq(kols.category, category));
  if (region && region !== "all") conditions.push(eq(kols.region, region));

  if (conditions.length > 0) {
    return db.select().from(kols).where(and(...conditions)).orderBy(kols.createdAt);
  }
  return db.select().from(kols).orderBy(kols.createdAt);
}

export async function getKolById(id: number): Promise<Kol | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(kols).where(eq(kols.id, id)).limit(1);
  return result[0];
}

export async function getKolPosts(kolId: number): Promise<KolPost[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(kolPosts).where(eq(kolPosts.kolId, kolId)).orderBy(kolPosts.createdAt);
}

export async function createKol(data: InsertKol): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(kols).values(data);
  return (result[0] as any).insertId as number;
}

export async function updateKol(id: number, data: Partial<InsertKol>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(kols).set(data).where(eq(kols.id, id));
}

export async function deleteKol(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(kolFolders).where(eq(kolFolders.kolId, id));
  await db.delete(kolPosts).where(eq(kolPosts.kolId, id));
  await db.delete(kols).where(eq(kols.id, id));
}

// ─── Bulk KOL operations ─────────────────────────────────────────────────────

export async function bulkDeleteKols(ids: number[]): Promise<{ deleted: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (ids.length === 0) return { deleted: 0 };
  await db.delete(kolFolders).where(inArray(kolFolders.kolId, ids));
  await db.delete(kolPosts).where(inArray(kolPosts.kolId, ids));
  await db.delete(kols).where(inArray(kols.id, ids));
  return { deleted: ids.length };
}

export async function bulkUpdateStatus(
  ids: number[],
  status: "active" | "inactive" | "pending"
): Promise<{ updated: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (ids.length === 0) return { updated: 0 };
  await db.update(kols).set({ status }).where(inArray(kols.id, ids));
  return { updated: ids.length };
}

export async function bulkEditKols(
  ids: number[],
  data: Partial<Pick<InsertKol, "region" | "postLanguage" | "category" | "tier">>
): Promise<{ updated: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (ids.length === 0) return { updated: 0 };
  await db.update(kols).set(data).where(inArray(kols.id, ids));
  return { updated: ids.length };
}

// ─── Enrichment helpers ───────────────────────────────────────────────────────

export async function updateKolEnrichment(
  id: number,
  data: { enrichmentStatus: "never" | "pending" | "done" | "failed"; enrichedAt?: Date }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(kols).set(data).where(eq(kols.id, id));
}

// ─── Handle-only import ───────────────────────────────────────────────────────

export async function importHandles(
  handles: string[],
  region?: string
): Promise<{ inserted: number; skipped: number; skippedHandles: string[]; insertedIds: number[] }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Get existing handles to deduplicate
  const existing = await db.select({ handle: kols.handle }).from(kols);
  const existingSet = new Set(existing.map(r => r.handle.toLowerCase()));

  const toInsert = handles.filter(h => !existingSet.has(h.toLowerCase()));
  const skippedHandles = handles.filter(h => existingSet.has(h.toLowerCase()));
  const insertedIds: number[] = [];

  for (const handle of toInsert) {
    const result = await db.insert(kols).values({
      handle,
      platform: "X",
      status: "pending",
      enrichmentStatus: "never",
      region: region ?? undefined,
      source: "handle_import",
    });
    insertedIds.push((result[0] as any).insertId as number);
  }

  return { inserted: toInsert.length, skipped: skippedHandles.length, skippedHandles, insertedIds };
}

// ─── Bulk import with posts (full CSV import) ─────────────────────────────────

export async function bulkImportWithPosts(
  kolRows: InsertKol[],
  postsByHandle: Map<string, InsertKolPost[]>
): Promise<{ kolsInserted: number; kolsSkipped: number; postsInserted: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (kolRows.length === 0) return { kolsInserted: 0, kolsSkipped: 0, postsInserted: 0 };

  // Fetch all existing handles once to deduplicate across DB
  const existing = await db.select({ handle: kols.handle, id: kols.id }).from(kols);
  const existingMap = new Map(existing.map(r => [r.handle.toLowerCase(), r.id]));

  // Deduplicate within the batch itself (keep first occurrence)
  const seenInBatch = new Set<string>();
  const dedupedRows: InsertKol[] = [];
  for (const kol of kolRows) {
    const key = kol.handle.toLowerCase();
    if (!seenInBatch.has(key)) {
      seenInBatch.add(key);
      dedupedRows.push(kol);
    }
  }

  let kolsInserted = 0;
  let kolsSkipped = 0;
  let postsInserted = 0;

  for (const kol of dedupedRows) {
    const key = kol.handle.toLowerCase();
    let kolId: number;

    if (existingMap.has(key)) {
      // KOL already exists — skip creation, still append posts
      kolId = existingMap.get(key)!;
      kolsSkipped++;
    } else {
      const result = await db.insert(kols).values(kol);
      kolId = (result[0] as any).insertId as number;
      existingMap.set(key, kolId); // track within this batch
      kolsInserted++;
    }

    const posts = postsByHandle.get(kol.handle) ?? [];
    if (posts.length > 0) {
      const resolvedPosts = posts.map(p => ({ ...p, kolId }));
      await db.insert(kolPosts).values(resolvedPosts);
      postsInserted += resolvedPosts.length;
    }
  }

  return { kolsInserted, kolsSkipped, postsInserted };
}

// ─── Folder helpers ───────────────────────────────────────────────────────────

export async function listFolders(): Promise<(Folder & { kolCount: number })[]> {
  const db = await getDb();
  if (!db) return [];
  const allFolders = await db.select().from(folders).orderBy(folders.createdAt);
  const allKolFolders = await db.select().from(kolFolders);

  const countMap = new Map<number, number>();
  for (const kf of allKolFolders) {
    countMap.set(kf.folderId, (countMap.get(kf.folderId) ?? 0) + 1);
  }

  return allFolders.map(f => ({ ...f, kolCount: countMap.get(f.id) ?? 0 }));
}

export async function getFolderById(id: number): Promise<Folder | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
  return result[0];
}

export async function createFolder(data: InsertFolder): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(folders).values(data);
  return (result[0] as any).insertId as number;
}

export async function updateFolder(id: number, data: Partial<InsertFolder>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(folders).set(data).where(eq(folders.id, id));
}

export async function deleteFolder(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(kolFolders).where(eq(kolFolders.folderId, id));
  await db.delete(folders).where(eq(folders.id, id));
}

// ─── KOL-Folder assignment ────────────────────────────────────────────────────

export async function getKolsInFolder(folderId: number): Promise<Kol[]> {
  const db = await getDb();
  if (!db) return [];
  const assignments = await db.select().from(kolFolders).where(eq(kolFolders.folderId, folderId));
  if (assignments.length === 0) return [];
  const kolIds = assignments.map(a => a.kolId);
  return db.select().from(kols).where(inArray(kols.id, kolIds)).orderBy(kols.createdAt);
}

export async function getFoldersForKol(kolId: number): Promise<Folder[]> {
  const db = await getDb();
  if (!db) return [];
  const assignments = await db.select().from(kolFolders).where(eq(kolFolders.kolId, kolId));
  if (assignments.length === 0) return [];
  const folderIds = assignments.map(a => a.folderId);
  return db.select().from(folders).where(inArray(folders.id, folderIds)).orderBy(folders.name);
}

export async function addKolsToFolder(kolIds: number[], folderId: number): Promise<{ added: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (kolIds.length === 0) return { added: 0 };

  // Get existing assignments to avoid duplicates
  const existing = await db.select().from(kolFolders).where(
    and(eq(kolFolders.folderId, folderId), inArray(kolFolders.kolId, kolIds))
  );
  const existingKolIds = new Set(existing.map(e => e.kolId));
  const toAdd = kolIds.filter(id => !existingKolIds.has(id));

  if (toAdd.length > 0) {
    await db.insert(kolFolders).values(toAdd.map(kolId => ({ kolId, folderId })));
  }
  return { added: toAdd.length };
}

export async function removeKolsFromFolder(kolIds: number[], folderId: number): Promise<{ removed: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (kolIds.length === 0) return { removed: 0 };
  await db.delete(kolFolders).where(
    and(eq(kolFolders.folderId, folderId), inArray(kolFolders.kolId, kolIds))
  );
  return { removed: kolIds.length };
}

export async function setKolFolders(kolId: number, folderIds: number[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Remove all existing folder assignments for this KOL
  await db.delete(kolFolders).where(eq(kolFolders.kolId, kolId));
  // Re-add the new set
  if (folderIds.length > 0) {
    await db.insert(kolFolders).values(folderIds.map(folderId => ({ kolId, folderId })));
  }
}

// ─── Reports ──────────────────────────────────────────────────────────────────


export async function createReport(data: InsertReport): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(reports).values(data).$returningId();
  return result.id;
}

export async function listReports(): Promise<Report[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reports).orderBy(reports.createdAt);
}

export async function getReportById(id: number): Promise<Report | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  return rows[0];
}

export async function deleteReport(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(reportResults).where(eq(reportResults.reportId, id));
  await db.delete(reports).where(eq(reports.id, id));
}

export async function saveReportResults(reportId: number, results: Omit<InsertReportResult, "reportId">[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (results.length === 0) return;
  const rows = results.map(r => ({ ...r, reportId }));
  // Insert in batches of 100
  for (let i = 0; i < rows.length; i += 100) {
    await db.insert(reportResults).values(rows.slice(i, i + 100));
  }
  // Update result count
  await db.update(reports).set({ resultCount: results.length }).where(eq(reports.id, reportId));
}

export async function getReportResults(reportId: number): Promise<ReportResult[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reportResults).where(eq(reportResults.reportId, reportId)).orderBy(reportResults.postedAt);
}

// ─── API Usage / Cost Tracker ─────────────────────────────────────────────────

export async function logApiUsage(params: {
  operation: string;
  itemCount: number;
  context?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // twitterapi.io pricing: 15 credits/tweet, 18 credits/profile, 1 USD = 100,000 credits
  const creditsPerItem = params.operation === "enrich_profile" ? 18 : 15;
  const credits = params.itemCount * creditsPerItem;
  const costUsd = (credits / 100000).toFixed(6);
  try {
    await db.insert(apiUsage).values({
      operation: params.operation,
      credits,
      itemCount: params.itemCount,
      context: params.context,
      costUsd,
    });
  } catch (_) {
    // non-critical — don't fail the main operation
  }
}

export async function getApiUsageStats(): Promise<{
  totalCredits: number;
  totalCostUsd: number;
  byOperation: { operation: string; credits: number; costUsd: number; itemCount: number; calls: number }[];
  recentUsage: ApiUsage[];
}> {
  const db = await getDb();
  if (!db) return { totalCredits: 0, totalCostUsd: 0, byOperation: [], recentUsage: [] };

  const rows = await db.select().from(apiUsage).orderBy(apiUsage.createdAt);

  const totalCredits = rows.reduce((s, r) => s + r.credits, 0);
  const totalCostUsd = rows.reduce((s, r) => s + parseFloat(r.costUsd as string), 0);

  const opMap = new Map<string, { credits: number; costUsd: number; itemCount: number; calls: number }>();
  for (const r of rows) {
    const existing = opMap.get(r.operation) ?? { credits: 0, costUsd: 0, itemCount: 0, calls: 0 };
    opMap.set(r.operation, {
      credits: existing.credits + r.credits,
      costUsd: existing.costUsd + parseFloat(r.costUsd as string),
      itemCount: existing.itemCount + r.itemCount,
      calls: existing.calls + 1,
    });
  }

  const byOperation = Array.from(opMap.entries()).map(([operation, stats]) => ({ operation, ...stats }));
  const recentUsage = rows.slice(-20).reverse();

  return { totalCredits, totalCostUsd, byOperation, recentUsage };
}

// ─── Campaign helpers ─────────────────────────────────────────────────────────

export async function listCampaigns(): Promise<Campaign[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaigns).orderBy(campaigns.createdAt);
}

export async function getCampaignById(id: number): Promise<Campaign | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(campaigns).where(eq(campaigns.id, id));
  return rows[0] ?? null;
}

export async function createCampaign(data: InsertCampaign): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(campaigns).values(data);
  return (result[0] as any).insertId as number;
}

export async function updateCampaign(id: number, data: Partial<InsertCampaign>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(campaigns).set(data).where(eq(campaigns.id, id));
}

export async function deleteCampaign(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(campaignPosts).where(eq(campaignPosts.campaignId, id));
  await db.delete(campaigns).where(eq(campaigns.id, id));
}

// ─── Campaign post helpers ────────────────────────────────────────────────────

export async function getCampaignPosts(campaignId: number): Promise<CampaignPost[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaignPosts).where(eq(campaignPosts.campaignId, campaignId));
}

export async function getKolCampaignPosts(kolId: number): Promise<(CampaignPost & { campaignName: string })[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ post: campaignPosts, campaignName: campaigns.name })
    .from(campaignPosts)
    .leftJoin(campaigns, eq(campaignPosts.campaignId, campaigns.id))
    .where(eq(campaignPosts.kolId, kolId));
  return rows.map(r => ({ ...r.post, campaignName: r.campaignName ?? "" }));
}

export async function insertCampaignPost(data: InsertCampaignPost): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(campaignPosts).values(data);
  return (result[0] as any).insertId as number;
}

export async function updateCampaignPost(id: number, data: Partial<InsertCampaignPost>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(campaignPosts).set(data).where(eq(campaignPosts.id, id));
}

export async function deleteCampaignPost(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(campaignPosts).where(eq(campaignPosts.id, id));
}

// ─── KOL avg-metrics recalculation from campaign posts ───────────────────────

/**
 * Recalculate and persist avg metrics for a KOL based on all their campaign posts.
 * Called after fetchMetrics completes or after report tweets are inserted.
 */
export async function recalcKolMetrics(kolId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const posts = await db
    .select()
    .from(campaignPosts)
    .where(and(eq(campaignPosts.kolId, kolId), eq(campaignPosts.fetchStatus, "done")));
  if (posts.length === 0) return;

  const avg = (arr: (number | null | undefined)[]) => {
    const valid = arr.filter((v): v is number => v != null);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  };

  const avgLikes = avg(posts.map(p => p.likes));
  const avgRetweets = avg(posts.map(p => p.retweets));
  const avgReplies = avg(posts.map(p => p.replies));
  const avgImpressions = avg(posts.map(p => p.views));
  // Avg engagement = likes + RT + replies + QT + saves per post
  const avgEngagement = avg(posts.map(p =>
    (p.likes ?? 0) + (p.retweets ?? 0) + (p.replies ?? 0) + (p.quotes ?? 0) + (p.bookmarks ?? 0)
  ));

  // Engagement rate = (likes + RT + replies + QT + saves) / views × 100 (as percentage)
  const engagementRate = avg(
    posts
      .filter(p => p.views != null && p.views > 0)
      .map(p => {
        const interactions = (p.likes ?? 0) + (p.retweets ?? 0) + (p.replies ?? 0) + (p.quotes ?? 0) + (p.bookmarks ?? 0);
        return (interactions / p.views!) * 100;
      })
  );

  const avgViews = avg(posts.map(p => p.views));

  // Count total campaign posts (done only) and total kol_posts
  const totalCampaignPosts = posts.length;
  const kolPostsRows = await db.select().from(kolPosts).where(eq(kolPosts.kolId, kolId));
  const totalKolPosts = kolPostsRows.length;

  const setData: any = {};
  if (avgLikes != null) setData.avgLikes = avgLikes;
  if (avgRetweets != null) setData.avgRetweets = avgRetweets;
  if (avgReplies != null) setData.avgReplies = avgReplies;
  if (avgImpressions != null) setData.avgImpressions = avgImpressions;
  if (avgEngagement != null) setData.avgEngagement = avgEngagement;
  if (engagementRate != null) setData.engagementRate = engagementRate;
  // New columns (may not exist in older DB deployments)
  try {
    const extData: any = { ...setData, totalCampaignPosts, totalKolPosts };
    if (avgViews != null) extData.avgViews = avgViews;
    await db.update(kols).set(extData).where(eq(kols.id, kolId));
  } catch {
    // Fallback: update without new columns
    if (Object.keys(setData).length > 0) {
      await db.update(kols).set(setData).where(eq(kols.id, kolId));
    }
  }
}

/**
 * Auto-insert report results as campaign posts for matched KOLs.
 * Creates a "Reports" system campaign if one doesn't exist.
 * Returns list of handles that appeared in results but are NOT in the KOL DB.
 */
export async function autoInsertReportTweets(
  results: Array<{
    tweetId?: string;
    authorHandle?: string;
    authorName?: string;
    kolId?: number | null;
    content?: string;
    url?: string;
    likes?: number;
    retweets?: number;
    replies?: number;
    quotes?: number;
    views?: number | null;
    bookmarks?: number | null;
    postedAt?: Date | null;
    language?: string;
  }>
): Promise<{ inserted: number; missingHandles: string[] }> {
  const db = await getDb();
  if (!db) return { inserted: 0, missingHandles: [] };

  // Collect all unique handles from results
  const allHandles = [...new Set(
    results.map(r => r.authorHandle?.toLowerCase()).filter(Boolean) as string[]
  )];

  // Get all KOLs to build handle→id map
  const allKols = await db.select({ id: kols.id, handle: kols.handle }).from(kols);
  const handleToId = new Map(allKols.map(k => [k.handle.toLowerCase(), k.id]));

  // Missing handles: in results but not in DB
  const missingHandles = allHandles.filter(h => !handleToId.has(h));

  // Find or create a "Reports (Auto)" system campaign
  let sysCampaign = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.name, "Reports (Auto)"))
    .limit(1);

  let campaignId: number;
  if (sysCampaign.length > 0) {
    campaignId = sysCampaign[0].id;
  } else {
    const res = await db.insert(campaigns).values({
      name: "Reports (Auto)",
      description: "Auto-created campaign for tweets found in report searches",
      status: "active",
    });
    campaignId = (res[0] as any).insertId as number;
  }

  // Get existing tweetIds in this campaign to avoid duplicates
  const existing = await db
    .select({ tweetId: campaignPosts.tweetId })
    .from(campaignPosts)
    .where(eq(campaignPosts.campaignId, campaignId));
  const existingIds = new Set(existing.map(r => r.tweetId).filter(Boolean));

  let inserted = 0;
  const affectedKolIds = new Set<number>();

  for (const r of results) {
    if (!r.tweetId || existingIds.has(r.tweetId)) continue;
    const handle = r.authorHandle?.toLowerCase() ?? "";
    const kolId = handleToId.get(handle) ?? null;
    if (!kolId) continue; // only insert for known KOLs

    await db.insert(campaignPosts).values({
      campaignId,
      kolId,
      tweetUrl: r.url ?? `https://x.com/${r.authorHandle}/status/${r.tweetId}`,
      tweetId: r.tweetId,
      kolHandle: r.authorHandle ?? null,
      likes: r.likes ?? 0,
      retweets: r.retweets ?? 0,
      replies: r.replies ?? 0,
      quotes: r.quotes ?? 0,
      views: r.views ?? null,
      bookmarks: r.bookmarks ?? null,
      tweetText: r.content ?? null,
      fetchStatus: "done",
      fetchedAt: new Date(),
    });
    existingIds.add(r.tweetId);
    affectedKolIds.add(kolId);
    inserted++;
  }

  // Recalculate metrics for all affected KOLs
  for (const kolId of affectedKolIds) {
    await recalcKolMetrics(kolId);
  }

  return { inserted, missingHandles };
}

export async function updateReportResult(id: number, data: Partial<Pick<InsertReportResult, "likes" | "retweets" | "replies" | "quotes" | "views" | "impressions" | "bookmarks">>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(reportResults).set(data).where(eq(reportResults.id, id));
}

/**
 * After refreshing a tweet's metrics (from any source), write the updated
 * metrics back to ALL matching rows in report_results and campaign_posts
 * that share the same tweetId. Also recalculates KOL metrics for any
 * affected KOLs.
 */
export async function syncTweetMetricsEverywhere(
  tweetId: string,
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    views: number | null;
    bookmarks: number | null;
    tweetText?: string | null;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Update all report_results rows with this tweetId
  await db.update(reportResults).set({
    likes: metrics.likes,
    retweets: metrics.retweets,
    replies: metrics.replies,
    quotes: metrics.quotes,
    views: metrics.views,
    impressions: metrics.views,
    bookmarks: metrics.bookmarks,
  }).where(eq(reportResults.tweetId, tweetId));

  // Update all campaign_posts rows with this tweetId
  const cpUpdate: any = {
    likes: metrics.likes,
    retweets: metrics.retweets,
    replies: metrics.replies,
    quotes: metrics.quotes,
    views: metrics.views,
    bookmarks: metrics.bookmarks,
    fetchStatus: "done" as const,
    fetchedAt: new Date(),
  };
  if (metrics.tweetText != null) cpUpdate.tweetText = metrics.tweetText;
  await db.update(campaignPosts).set(cpUpdate).where(eq(campaignPosts.tweetId, tweetId));

  // Recalc metrics for all KOLs that had campaign posts with this tweetId
  const affectedPosts = await db.select({ kolId: campaignPosts.kolId })
    .from(campaignPosts)
    .where(eq(campaignPosts.tweetId, tweetId));
  const affectedKolIds = new Set(affectedPosts.map(p => p.kolId).filter((id): id is number => id != null));
  for (const kolId of affectedKolIds) {
    await recalcKolMetrics(kolId);
  }
}

// ─── Saved Searches ───────────────────────────────────────────────────────────

export async function listSavedSearches(): Promise<SavedSearch[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(savedSearches).orderBy(savedSearches.createdAt);
  } catch {
    return []; // table may not exist yet in production
  }
}

export async function createSavedSearch(data: InsertSavedSearch): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(savedSearches).values(data);
  return (result[0] as any).insertId as number;
}

export async function deleteSavedSearch(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(savedSearches).where(eq(savedSearches.id, id));
}

// ─── Folder Dashboard ─────────────────────────────────────────────────────────

export async function getFolderDashboardStats(params: {
  folderId: number;
  startDate?: Date;
  endDate?: Date;
  campaignIds?: number[];
}): Promise<{
  totalImpressions: number;
  totalLikes: number;
  totalRetweets: number;
  totalQuotes: number;
  totalSaves: number;
  totalBudget: number;
  totalPosts: number;
  cpm: number | null;
  cpp: number | null;
}> {
  const db = await getDb();
  if (!db) return { totalImpressions: 0, totalLikes: 0, totalRetweets: 0, totalQuotes: 0, totalSaves: 0, totalBudget: 0, totalPosts: 0, cpm: null, cpp: null };

  // Get KOL IDs in folder
  const assignments = await db.select().from(kolFolders).where(eq(kolFolders.folderId, params.folderId));
  if (assignments.length === 0) return { totalImpressions: 0, totalLikes: 0, totalRetweets: 0, totalQuotes: 0, totalSaves: 0, totalBudget: 0, totalPosts: 0, cpm: null, cpp: null };
  const kolIds = assignments.map(a => a.kolId);

  // Build campaign_posts query conditions
  const conditions: SQL[] = [inArray(campaignPosts.kolId, kolIds), eq(campaignPosts.fetchStatus, "done")];
  if (params.campaignIds && params.campaignIds.length > 0) {
    conditions.push(inArray(campaignPosts.campaignId, params.campaignIds));
  }
  if (params.startDate) conditions.push(gte(campaignPosts.fetchedAt, params.startDate));
  if (params.endDate) conditions.push(lte(campaignPosts.fetchedAt, params.endDate));

  const posts = await db.select().from(campaignPosts).where(and(...conditions));

  // Get costPerPost for each KOL
  const kolRows = await db.select({ id: kols.id, costPerPost: kols.costPerPost }).from(kols).where(inArray(kols.id, kolIds));
  const kolCostMap = new Map(kolRows.map(k => [k.id, Number(k.costPerPost ?? 0)]));

  const totalImpressions = posts.reduce((s, p) => s + (p.views ? Number(p.views) : 0), 0);
  const totalLikes = posts.reduce((s, p) => s + (p.likes ?? 0), 0);
  const totalRetweets = posts.reduce((s, p) => s + (p.retweets ?? 0), 0);
  const totalQuotes = posts.reduce((s, p) => s + (p.quotes ?? 0), 0);
  const totalSaves = posts.reduce((s, p) => s + (p.bookmarks ?? 0), 0);
  const totalPosts = posts.length;

  // Budget: use per-post budget if set, else fall back to KOL's costPerPost
  const totalBudget = posts.reduce((s, p) => {
    const budget = p.budget != null ? Number(p.budget) : (p.kolId ? kolCostMap.get(p.kolId) ?? 0 : 0);
    return s + budget;
  }, 0);

  const cpm = totalBudget > 0 && totalImpressions > 0 ? (totalBudget / totalImpressions) * 1000 : null;
  const cpp = totalBudget > 0 && totalPosts > 0 ? totalBudget / totalPosts : null;

  return { totalImpressions, totalLikes, totalRetweets, totalQuotes, totalSaves, totalBudget, totalPosts, cpm, cpp };
}

export async function getFolderTop20Contributors(params: {
  folderId: number;
  startDate?: Date;
  endDate?: Date;
  campaignIds?: number[];
}): Promise<Array<{
  kolId: number;
  handle: string;
  displayName: string | null;
  postCount: number;
  totalImpressions: number;
  totalLikes: number;
  totalRetweets: number;
  totalQuotes: number;
  totalSaves: number;
}>> {
  const db = await getDb();
  if (!db) return [];

  const assignments = await db.select().from(kolFolders).where(eq(kolFolders.folderId, params.folderId));
  if (assignments.length === 0) return [];
  const kolIds = assignments.map(a => a.kolId);

  const conditions: SQL[] = [inArray(campaignPosts.kolId, kolIds), eq(campaignPosts.fetchStatus, "done")];
  if (params.campaignIds && params.campaignIds.length > 0) conditions.push(inArray(campaignPosts.campaignId, params.campaignIds));
  if (params.startDate) conditions.push(gte(campaignPosts.fetchedAt, params.startDate));
  if (params.endDate) conditions.push(lte(campaignPosts.fetchedAt, params.endDate));

  const posts = await db.select().from(campaignPosts).where(and(...conditions));
  const kolRows = await db.select({ id: kols.id, handle: kols.handle, displayName: kols.displayName }).from(kols).where(inArray(kols.id, kolIds));
  const kolMap = new Map(kolRows.map(k => [k.id, k]));

  const statsMap = new Map<number, { postCount: number; totalImpressions: number; totalLikes: number; totalRetweets: number; totalQuotes: number; totalSaves: number }>();
  for (const p of posts) {
    if (!p.kolId) continue;
    const existing = statsMap.get(p.kolId) ?? { postCount: 0, totalImpressions: 0, totalLikes: 0, totalRetweets: 0, totalQuotes: 0, totalSaves: 0 };
    statsMap.set(p.kolId, {
      postCount: existing.postCount + 1,
      totalImpressions: existing.totalImpressions + (p.views ? Number(p.views) : 0),
      totalLikes: existing.totalLikes + (p.likes ?? 0),
      totalRetweets: existing.totalRetweets + (p.retweets ?? 0),
      totalQuotes: existing.totalQuotes + (p.quotes ?? 0),
      totalSaves: existing.totalSaves + (p.bookmarks ?? 0),
    });
  }

  const results = Array.from(statsMap.entries()).map(([kolId, stats]) => ({
    kolId,
    handle: kolMap.get(kolId)?.handle ?? "unknown",
    displayName: kolMap.get(kolId)?.displayName ?? null,
    ...stats,
  }));

  return results.sort((a, b) => b.totalImpressions - a.totalImpressions).slice(0, 20);
}

export async function getFolderTweetTexts(params: {
  folderId: number;
  startDate?: Date;
  endDate?: Date;
  campaignIds?: number[];
}): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const assignments = await db.select().from(kolFolders).where(eq(kolFolders.folderId, params.folderId));
  if (assignments.length === 0) return [];
  const kolIds = assignments.map(a => a.kolId);

  const conditions: SQL[] = [inArray(campaignPosts.kolId, kolIds), eq(campaignPosts.fetchStatus, "done")];
  if (params.campaignIds && params.campaignIds.length > 0) conditions.push(inArray(campaignPosts.campaignId, params.campaignIds));
  if (params.startDate) conditions.push(gte(campaignPosts.fetchedAt, params.startDate));
  if (params.endDate) conditions.push(lte(campaignPosts.fetchedAt, params.endDate));

  const posts = await db.select({ tweetText: campaignPosts.tweetText }).from(campaignPosts).where(and(...conditions));
  return posts.map(p => p.tweetText).filter((t): t is string => !!t);
}

// ─── Report → Campaign conversion ────────────────────────────────────────────

export async function saveReportAsCampaign(reportId: number, campaignName: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const results = await getReportResults(reportId);
  if (results.length === 0) throw new Error("Report has no results");

  // Create the new campaign
  const campaignResult = await db.insert(campaigns).values({
    name: campaignName,
    description: `Created from report #${reportId}`,
    status: "active",
  });
  const campaignId = (campaignResult[0] as any).insertId as number;

  // Get all KOLs to match handles
  const allKols = await db.select({ id: kols.id, handle: kols.handle }).from(kols);
  const handleToId = new Map(allKols.map(k => [k.handle.toLowerCase(), k.id]));

  // Insert each report result as a campaign post
  const toInsert: InsertCampaignPost[] = [];
  for (const r of results) {
    if (!r.tweetId && !r.url) continue;
    const tweetId = r.tweetId ?? (r.url?.match(/\/status\/([0-9]+)/)?.[1] ?? null);
    const kolId = r.authorHandle ? (handleToId.get(r.authorHandle.toLowerCase()) ?? null) : null;
    toInsert.push({
      campaignId,
      kolId,
      tweetUrl: r.url ?? `https://x.com/${r.authorHandle}/status/${tweetId}`,
      tweetId: tweetId ?? undefined,
      kolHandle: r.authorHandle ?? undefined,
      likes: r.likes ?? 0,
      retweets: r.retweets ?? 0,
      replies: r.replies ?? 0,
      quotes: r.quotes ?? 0,
      views: r.views ?? null,
      bookmarks: r.bookmarks ?? null,
      tweetText: r.content ?? null,
      fetchStatus: "done",
      fetchedAt: new Date(),
    });
  }

  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 100) {
      await db.insert(campaignPosts).values(toInsert.slice(i, i + 100));
    }
  }

  // Recalc metrics for all matched KOLs
  const affectedKolIds = new Set(toInsert.map(p => p.kolId).filter((id): id is number => id != null));
  for (const kolId of affectedKolIds) {
    await recalcKolMetrics(kolId);
  }

  return campaignId;
}
