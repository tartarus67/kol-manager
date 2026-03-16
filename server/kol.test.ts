import { describe, expect, it } from "vitest";
import { parseCSV, detectFormat } from "./csvIntake";

// ─── Format Detection ─────────────────────────────────────────────────────────

describe("detectFormat", () => {
  it("detects Cookie3 Nova format", () => {
    const lines = [
      "KOL Username,KOL Display Name,URL,Followers,Engagement Rate %,Average Engagement,Average Post Impressions,Score,Posts,Impressions,Total time on top",
    ];
    const { format } = detectFormat(lines);
    expect(format).toBe("COOKIE3_NOVA");
  });

  it("detects Cookie3 Turkish format with Smart Followers", () => {
    const lines = [
      "KOL Username,KOL Display Name,URL,Followers,Smart Followers,Engagement Rate %,Average Engagement,Average Post Impressions,Score",
    ];
    const { format } = detectFormat(lines);
    expect(format).toBe("COOKIE3_TURKISH");
  });

  it("detects India campaign format", () => {
    const lines = [
      "Week,Month,Billing Cycle,Topic,Channel Name,Link,Followers,Format,Status,Post Link,Views,Likes,Comment,Repost,Bookmark,Total Engagement,Engagement Rate,Featured Reviews,Cost per post,CPM",
    ];
    const { format } = detectFormat(lines);
    expect(format).toBe("CAMPAIGN_INDIA");
  });

  it("detects Korea Nov~Dec format (has BSC column)", () => {
    const lines = [
      "Channel Name,Platform,Tier,Categories,Type,Subject,Date,Title,Link,Views,Result,Budget,EVM,BSC,TXID,Paid,Notes",
    ];
    const { format } = detectFormat(lines);
    expect(format).toBe("CAMPAIGN_KOREA_NOVDEC");
  });

  it("detects Korea Jan format (EVM but no BSC)", () => {
    const lines = [
      "Channel Name,Platform,Tier,Categories,Type,Subject,Date,Title,Link,Views,Result,Budget,EVM,TXID,Paid,Notes",
    ];
    const { format } = detectFormat(lines);
    expect(format).toBe("CAMPAIGN_KOREA_JAN");
  });

  it("returns UNKNOWN for unrecognized format", () => {
    const lines = ["Name,Email,Phone"];
    const { format } = detectFormat(lines);
    expect(format).toBe("UNKNOWN");
  });
});

// ─── Cookie3 Nova Parsing ─────────────────────────────────────────────────────

describe("parseCSV - Cookie3 Nova", () => {
  const csv = [
    "Cookie3",
    "KOL Username,KOL Display Name,URL,Followers,Engagement Rate %,Average Engagement,Average Post Impressions,Score,Posts,Impressions,Total time on top",
    "@cryptoalpha,Crypto Alpha,https://x.com/cryptoalpha,\"22,685\",3.657055852,829.5,22685,85.5,10,226850,2h",
    "@defiking,DeFi King,https://x.com/defiking,\"9,374\",5.12,480.1,9374,72.3,8,74992,1h",
  ].join("\n");

  it("parses two KOLs correctly", () => {
    const result = parseCSV(csv, "test_nova");
    expect(result.format).toBe("COOKIE3_NOVA");
    expect(result.kols).toHaveLength(2);
    expect(result.posts).toHaveLength(0);
  });

  it("strips @ from handle", () => {
    const result = parseCSV(csv);
    expect(result.kols[0].handle).toBe("cryptoalpha");
  });

  it("parses followers with comma formatting", () => {
    const result = parseCSV(csv);
    expect(result.kols[0].followers).toBe(22685);
    expect(result.kols[1].followers).toBe(9374);
  });

  it("rounds engagement rate to 4 decimal places", () => {
    const result = parseCSV(csv);
    // 3.657055852 → 3.6571
    expect(result.kols[0].engagementRate).toBe(3.6571);
  });

  it("sets region to Nova", () => {
    const result = parseCSV(csv);
    expect(result.kols[0].region).toBe("Nova");
  });

  it("sets platform to X", () => {
    const result = parseCSV(csv);
    expect(result.kols[0].platform).toBe("X");
  });

  it("sets source label", () => {
    const result = parseCSV(csv, "my_import");
    expect(result.kols[0].source).toBe("my_import");
  });
});

// ─── Cookie3 Turkish Parsing ──────────────────────────────────────────────────

describe("parseCSV - Cookie3 Turkish", () => {
  const csv = [
    "KOL Username,KOL Display Name,URL,Followers,Smart Followers,Engagement Rate %,Average Engagement,Average Post Impressions,Score",
    "@turkishkol,Turkish KOL,https://x.com/turkishkol,\"50,000\",\"45,000\",2.5,1250,50000,90.0",
  ].join("\n");

  it("detects Turkish format and parses smart followers", () => {
    const result = parseCSV(csv, "test_turkish");
    expect(result.format).toBe("COOKIE3_TURKISH");
    expect(result.kols[0].smartFollowers).toBe(45000);
    expect(result.kols[0].region).toBe("Turkey");
  });
});

// ─── India Campaign Parsing ───────────────────────────────────────────────────

describe("parseCSV - India Campaign", () => {
  const csv = [
    "Week,Month,Billing Cycle,Topic,Channel Name,Link,Followers,Format,Status,Post Link,Views,Likes,Comment,Repost,Bookmark,Total Engagement,Engagement Rate,Featured Reviews,Cost per post,CPM",
    "Week 01,2025/04,1,Binance Vote,CryptoIndia,,\"\",Tweet,Done,https://x.com/cryptoindia/status/1,\"2,700\",86,3,22,1,111,4.11%,,$550,$204",
    "Week 01,2025/04,1,Binance Vote,CryptoIndia,,\"\",Tweet,Done,https://x.com/cryptoindia/status/2,\"3,000\",35,12,5,,53,1.76%,,$250,$83",
    "Week 01,2025/04,1,Binance Vote,OtherKOL,,\"\",TG post,Done,https://t.me/otherkol/100,\"5,000\",,,,,,,,$300,$60",
  ].join("\n");

  it("deduplicates KOLs by channel name", () => {
    const result = parseCSV(csv, "test_india");
    expect(result.format).toBe("CAMPAIGN_INDIA");
    expect(result.kols).toHaveLength(2); // CryptoIndia + OtherKOL
  });

  it("collects all posts", () => {
    const result = parseCSV(csv);
    expect(result.posts).toHaveLength(3);
  });

  it("infers platform from post URL", () => {
    const result = parseCSV(csv);
    // CryptoIndia posts → x.com
    expect(result.posts[0].platform).toBe("X");
    // OtherKOL post → t.me
    expect(result.posts[2].platform).toBe("Telegram");
  });

  it("parses engagement rate stripping % sign", () => {
    const result = parseCSV(csv);
    expect(result.posts[0].engagementRate).toBe(4.11);
  });

  it("parses cost stripping $ sign", () => {
    const result = parseCSV(csv);
    expect(result.posts[0].costPerPost).toBe(550);
  });

  it("sets region to India", () => {
    const result = parseCSV(csv);
    expect(result.kols[0].region).toBe("India");
  });
});

// ─── Korea Campaign Parsing ───────────────────────────────────────────────────

describe("parseCSV - Korea Campaign (Jan)", () => {
  const csv = [
    "Channel Name,Platform,Tier,Categories,Type,Subject,Date,Title,Link,Views,Result,Budget,EVM,TXID,Paid,Notes",
    "KoreanKOL1,Telegram,1 Tier,Alpha,Post,Aethir Launch,1/16,Aethir is live,https://t.me/koreankol1/50,\"10,000\",Good,500,0xABC,0xTXID1,Yes,",
    "KoreanKOL1,Telegram,1 Tier,Alpha,Post,Aethir Update,1/20,New update,https://t.me/koreankol1/55,\"8,000\",Good,500,0xABC,0xTXID2,Yes,",
    "KoreanKOL2,X,2 Tier,Trading,Tweet,Aethir Launch,1/16,Thread,https://x.com/koreankol2/1,\"5,000\",Average,200,0xDEF,0xTXID3,Yes,",
  ].join("\n");

  it("deduplicates KOLs", () => {
    const result = parseCSV(csv, "test_korea");
    expect(result.format).toBe("CAMPAIGN_KOREA_JAN");
    expect(result.kols).toHaveLength(2);
  });

  it("collects all posts", () => {
    const result = parseCSV(csv);
    expect(result.posts).toHaveLength(3);
  });

  it("captures tier and category", () => {
    const result = parseCSV(csv);
    expect(result.kols[0].tier).toBe("1 Tier");
    expect(result.kols[0].category).toBe("Alpha");
  });

  it("captures wallet and tx data", () => {
    const result = parseCSV(csv);
    expect(result.posts[0].walletAddress).toBe("0xABC");
    expect(result.posts[0].txId).toBe("0xTXID1");
    expect(result.posts[0].paid).toBe("Yes");
  });

  it("parses budget as costPerPost", () => {
    const result = parseCSV(csv);
    expect(result.posts[0].costPerPost).toBe(500);
  });

  it("sets region to Korea", () => {
    const result = parseCSV(csv);
    expect(result.kols[0].region).toBe("Korea");
  });
});

// ─── Unknown Format ───────────────────────────────────────────────────────────

describe("parseCSV - Unknown format", () => {
  it("returns UNKNOWN with warning", () => {
    const result = parseCSV("Name,Email\nAlice,alice@example.com");
    expect(result.format).toBe("UNKNOWN");
    expect(result.kols).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe("parseCSV - edge cases", () => {
  it("handles empty rows gracefully", () => {
    const csv = [
      "KOL Username,KOL Display Name,URL,Followers,Engagement Rate %,Average Engagement,Average Post Impressions,Score",
      "@kol1,KOL One,,1000,2.5,25,1000,80",
      ",,,,,,,,",
      "@kol2,KOL Two,,2000,3.0,60,2000,85",
    ].join("\n");
    const result = parseCSV(csv);
    expect(result.kols).toHaveLength(2);
  });

  it("handles Windows CRLF line endings", () => {
    const csv = "KOL Username,KOL Display Name,URL,Followers,Engagement Rate %,Average Engagement,Average Post Impressions,Score\r\n@kol1,KOL One,,1000,2.5,25,1000,80\r\n";
    const result = parseCSV(csv);
    expect(result.kols).toHaveLength(1);
    expect(result.kols[0].handle).toBe("kol1");
  });

  it("handles missing/dash values as undefined", () => {
    const csv = [
      "KOL Username,KOL Display Name,URL,Followers,Engagement Rate %,Average Engagement,Average Post Impressions,Score",
      "@kol1,KOL One,,-,-, ,-,",
    ].join("\n");
    const result = parseCSV(csv);
    expect(result.kols[0].followers).toBeUndefined();
    expect(result.kols[0].engagementRate).toBeUndefined();
  });
});
