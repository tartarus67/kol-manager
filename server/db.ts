import { eq, like, or, and, SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, kols, kolPosts, InsertKol, InsertKolPost, Kol, KolPost } from "../drizzle/schema";
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
  // Delete associated posts first
  await db.delete(kolPosts).where(eq(kolPosts.kolId, id));
  await db.delete(kols).where(eq(kols.id, id));
}

export async function bulkImport(
  kolRows: InsertKol[],
  postRows: InsertKolPost[]
): Promise<{ kolsInserted: number; postsInserted: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (kolRows.length === 0) return { kolsInserted: 0, postsInserted: 0 };

  // Insert KOLs and collect their IDs
  const kolIdMap = new Map<string, number>(); // handle → id
  for (const kol of kolRows) {
    const result = await db.insert(kols).values(kol);
    const insertId = (result[0] as any).insertId as number;
    kolIdMap.set(kol.handle, insertId);
  }

  // Resolve kolId placeholders in posts
  let postsInserted = 0;
  if (postRows.length > 0) {
    // Posts from campaign trackers have kolId=0 as placeholder
    // We need to match them by handle — posts carry source info but not handle directly.
    // The caller is responsible for passing posts with correct kolId already resolved,
    // OR we resolve here by matching on source+channelName pattern.
    // For now: posts already have kolId=0 as placeholder; we resolve by order.
    // Since campaign parsers build kolMap and posts in parallel, we re-resolve by
    // matching post source to kol handle via the kolIdMap.
    // Posts don't carry handle — we resolve by inserting in the same order as kols.
    // Better approach: resolve in the router after parsing.
    const resolvedPosts = postRows.filter(p => p.kolId > 0);
    if (resolvedPosts.length > 0) {
      await db.insert(kolPosts).values(resolvedPosts);
      postsInserted = resolvedPosts.length;
    }
  }

  return { kolsInserted: kolRows.length, postsInserted };
}

export async function bulkImportWithPosts(
  kolRows: InsertKol[],
  postsByHandle: Map<string, InsertKolPost[]>
): Promise<{ kolsInserted: number; postsInserted: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (kolRows.length === 0) return { kolsInserted: 0, postsInserted: 0 };

  let postsInserted = 0;

  for (const kol of kolRows) {
    const result = await db.insert(kols).values(kol);
    const insertId = (result[0] as any).insertId as number;

    const posts = postsByHandle.get(kol.handle) ?? [];
    if (posts.length > 0) {
      const resolvedPosts = posts.map(p => ({ ...p, kolId: insertId }));
      await db.insert(kolPosts).values(resolvedPosts);
      postsInserted += resolvedPosts.length;
    }
  }

  return { kolsInserted: kolRows.length, postsInserted };
}
