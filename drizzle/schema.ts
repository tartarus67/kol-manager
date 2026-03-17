import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  bigint,
} from "drizzle-orm/mysql-core";

// ─── Users (auth) ────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── KOLs ────────────────────────────────────────────────────────────────────
//
// One row = one KOL identity. Metrics here are KOL-level aggregates
// (audience size, overall engagement quality) — not campaign-specific.
//
// Metric categories captured:
//   IDENTITY      handle, displayName, platform, profileUrl
//   AUDIENCE      followers, smartFollowers (bot-filtered)
//   ENGAGEMENT    engagementRate, avgEngagement, avgImpressions
//   QUALITY       score (Cookie3 or similar), tier
//   CLASSIFICATION region, category, contentType, contentFormat, tags
//   CAMPAIGN      costPerPost (typical/agreed rate)
//   ADMIN         status, notes, region, source (which sheet it came from)

export const kols = mysqlTable("kols", {
  id: int("id").autoincrement().primaryKey(),

  // Identity
  handle: varchar("handle", { length: 128 }).notNull(),
  displayName: varchar("displayName", { length: 256 }),
  platform: varchar("platform", { length: 64 }).notNull().default("X"),
  profileUrl: varchar("profileUrl", { length: 512 }),

  // Audience metrics
  followers: bigint("followers", { mode: "number" }),
  smartFollowers: int("smartFollowers"),       // Bot-filtered follower count (Cookie3)

  // Engagement metrics
  engagementRate: decimal("engagementRate", { precision: 8, scale: 4, mode: "number" }),
  avgEngagement: decimal("avgEngagement", { precision: 12, scale: 2, mode: "number" }),
  avgImpressions: decimal("avgImpressions", { precision: 14, scale: 2, mode: "number" }),

  // Quality / scoring
  score: decimal("score", { precision: 10, scale: 2, mode: "number" }),
  tier: varchar("tier", { length: 32 }),                  // e.g. "1 Tier", "1.5 Tier"

  // Classification
  region: varchar("region", { length: 64 }),              // India, Korea, Turkey, Nova...
  category: varchar("category", { length: 128 }),         // Alpha, Trading, News, etc.
  contentType: varchar("contentType", { length: 128 }),   // Educational, Meme, Alpha, etc.
  contentFormat: varchar("contentFormat", { length: 128 }), // Tweet, Thread, Video, etc.
  tags: text("tags"),                                     // Comma-separated free tags

  // Campaign economics
  costPerPost: decimal("costPerPost", { precision: 10, scale: 2, mode: "number" }),

  // Extended X API enrichment fields
  profileImageUrl: varchar("profileImageUrl", { length: 512 }),
  profileBio: text("profileBio"),
  postLanguage: varchar("postLanguage", { length: 32 }),   // ISO 639-1 majority lang from recent tweets
  accountCreatedAt: timestamp("accountCreatedAt"),
  verified: varchar("verified", { length: 32 }),           // none / blue / business / government
  avgLikes: decimal("avgLikes", { precision: 10, scale: 2, mode: "number" }),
  avgRetweets: decimal("avgRetweets", { precision: 10, scale: 2, mode: "number" }),
  avgReplies: decimal("avgReplies", { precision: 10, scale: 2, mode: "number" }),

  // Admin
  status: mysqlEnum("status", ["active", "inactive", "pending"]).default("active").notNull(),
  enrichmentStatus: mysqlEnum("enrichmentStatus", ["never", "pending", "done", "failed"]).default("never").notNull(),
  enrichedAt: timestamp("enrichedAt"),
  source: varchar("source", { length: 128 }),  // Which sheet/import batch this came from
  notes: text("notes"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Kol = typeof kols.$inferSelect;
export type InsertKol = typeof kols.$inferInsert;

// ─── KOL Posts ───────────────────────────────────────────────────────────────
//
// One row = one tracked post/campaign activation.
// Captures post-level performance metrics from campaign trackers.
//
// Metric categories captured:
//   IDENTITY      kolId (FK), postUrl, platform, postDate
//   CAMPAIGN      topic/subject, postType (Tweet/TG/Thread), campaignBudget
//   REACH         views, impressions
//   ENGAGEMENT    likes, comments, reposts, bookmarks, quotes, totalEngagement, engagementRate
//   QUALITY       result (Good/Average/etc.), featured reviews
//   ECONOMICS     costPerPost, cpm
//   PAYMENT       walletAddress, txId, paid

export const kolPosts = mysqlTable("kol_posts", {
  id: int("id").autoincrement().primaryKey(),
  kolId: int("kolId").notNull(),               // FK → kols.id

  // Post identity
  postUrl: varchar("postUrl", { length: 512 }),
  platform: varchar("platform", { length: 64 }),
  postDate: varchar("postDate", { length: 32 }),  // stored as string (formats vary: "1/16", "9/25")
  postTitle: text("postTitle"),                   // title or content snippet

  // Campaign context
  topic: varchar("topic", { length: 256 }),       // campaign topic/subject
  postType: varchar("postType", { length: 64 }),  // Tweet, TG post, Thread, Video, etc.
  campaignRegion: varchar("campaignRegion", { length: 64 }),
  campaignSubject: varchar("campaignSubject", { length: 128 }),

  // Reach metrics
  views: int("views"),
  impressions: bigint("impressions", { mode: "number" }),

  // Engagement metrics
  likes: int("likes"),
  comments: int("comments"),
  reposts: int("reposts"),
  quotes: int("quotes"),
  bookmarks: int("bookmarks"),
  totalEngagement: int("totalEngagement"),
  engagementRate: decimal("engagementRate", { precision: 8, scale: 4, mode: "number" }),

  // Quality assessment
  result: varchar("result", { length: 64 }),      // Good, Average, Perfect, etc.
  featuredReview: text("featuredReview"),

  // Economics
  costPerPost: decimal("costPerPost", { precision: 10, scale: 2, mode: "number" }),
  cpm: decimal("cpm", { precision: 10, scale: 2, mode: "number" }),

  // Payment (Korea sheets have on-chain payment data)
  walletAddress: varchar("walletAddress", { length: 256 }),
  txId: varchar("txId", { length: 512 }),
  paid: varchar("paid", { length: 32 }),

  source: varchar("source", { length: 128 }),     // which sheet this came from

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type KolPost = typeof kolPosts.$inferSelect;
export type InsertKolPost = typeof kolPosts.$inferInsert;

// ─── Folders ─────────────────────────────────────────────────────────────────
//
// Folders are organizational groups (e.g. "Agency A", "Internal Aethir KOLs").
// KOLs can belong to multiple folders (many-to-many via kol_folders).

export const folders = mysqlTable("folders", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 32 }).default("#D8FE51"),  // Aethir green default
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Folder = typeof folders.$inferSelect;
export type InsertFolder = typeof folders.$inferInsert;

export const kolFolders = mysqlTable("kol_folders", {
  id: int("id").autoincrement().primaryKey(),
  kolId: int("kolId").notNull(),      // FK → kols.id
  folderId: int("folderId").notNull(), // FK → folders.id
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type KolFolder = typeof kolFolders.$inferSelect;
export type InsertKolFolder = typeof kolFolders.$inferInsert;

// ─── Reports ─────────────────────────────────────────────────────────────────────────────
//
// A saved report = a named search query + its results snapshot.
// Keyword mode: 'AND' = all keywords must appear, 'OR' = any keyword matches.
// Filters are stored as JSON arrays (kolIds, languages, regions, folderIds).

export const reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),

  // Search parameters
  keywords: text("keywords").notNull(),          // JSON array of keyword strings
  keywordMode: mysqlEnum("keywordMode", ["AND", "OR"]).default("OR").notNull(),
  startDate: varchar("startDate", { length: 32 }), // ISO date string
  endDate: varchar("endDate", { length: 32 }),

  // Filters (stored as JSON arrays)
  kolIds: text("kolIds"),       // JSON: number[]
  languages: text("languages"), // JSON: string[]
  regions: text("regions"),     // JSON: string[]
  folderIds: text("folderIds"), // JSON: number[]

  resultCount: int("resultCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;

export const reportResults = mysqlTable("report_results", {
  id: int("id").autoincrement().primaryKey(),
  reportId: int("reportId").notNull(), // FK → reports.id

  // Tweet identity
  tweetId: varchar("tweetId", { length: 64 }),
  authorHandle: varchar("authorHandle", { length: 128 }),
  authorName: varchar("authorName", { length: 256 }),
  kolId: int("kolId"),  // FK → kols.id if matched

  // Content
  content: text("content"),
  postedAt: timestamp("postedAt"),
  language: varchar("language", { length: 16 }),
  url: varchar("url", { length: 512 }),

  // Metrics
  likes: int("likes").default(0),
  retweets: int("retweets").default(0),
  replies: int("replies").default(0),
  quotes: int("quotes").default(0),
  impressions: bigint("impressions", { mode: "number" }),
  views: bigint("views", { mode: "number" }),
  bookmarks: int("bookmarks"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ReportResult = typeof reportResults.$inferSelect;
export type InsertReportResult = typeof reportResults.$inferInsert;

// ─── API Usage / Cost Tracker ────────────────────────────────────────────────
export const apiUsage = mysqlTable("api_usage", {
  id: int("id").autoincrement().primaryKey(),
  // operation: "search" | "enrich_profile" | "enrich_timeline"
  operation: varchar("operation", { length: 64 }).notNull(),
  // credits consumed (15 per tweet, 18 per profile)
  credits: int("credits").notNull().default(0),
  // number of items returned (tweets or profiles)
  itemCount: int("itemCount").notNull().default(0),
  // optional context (report name, KOL handle, etc.)
  context: varchar("context", { length: 256 }),
  // USD cost: credits / 100000
  costUsd: decimal("costUsd", { precision: 10, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ApiUsage = typeof apiUsage.$inferSelect;
export type InsertApiUsage = typeof apiUsage.$inferInsert;
