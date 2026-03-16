import { eq, like, or, and, inArray, SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  kols, kolPosts, folders, kolFolders,
  reports, reportResults,
  InsertKol, InsertKolPost, InsertFolder, InsertReport, InsertReportResult,
  Kol, KolPost, Folder, KolFolder, Report, ReportResult,
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
