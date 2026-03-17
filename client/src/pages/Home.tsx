import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Users, TrendingUp, Tag, Activity, DollarSign, Zap } from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();
  const { data: kols = [] } = trpc.kol.list.useQuery({});

  const totalKols = kols.length;
  const activeKols = kols.filter(k => k.status === "active").length;
  const categorySet = new Set(kols.map(k => k.category).filter((c): c is string => !!c));
  const categories = categorySet.size;
  const totalFollowers = kols.reduce((sum, k) => sum + (k.followers ?? 0), 0);

  const formatFollowers = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  const recentKols = [...kols]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const categoryBreakdown = kols.reduce<Record<string, number>>((acc, k) => {
    const cat = k.category || "Uncategorized";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const regionBreakdown = kols.reduce<Record<string, number>>((acc, k) => {
    const reg = k.region || "Unknown";
    acc[reg] = (acc[reg] || 0) + 1;
    return acc;
  }, {});

  return (
    <DashboardLayout>
      <div className="space-y-6 p-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">Aethir KOL roster overview</p>
          </div>
          <button
            onClick={() => setLocation("/kols")}
            className="text-xs px-3 py-1.5 rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
          >
            View All KOLs →
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<Users className="h-4 w-4" />} label="Total KOLs" value={totalKols.toString()} />
          <StatCard icon={<Activity className="h-4 w-4" />} label="Active" value={activeKols.toString()} highlight />
          <StatCard icon={<Tag className="h-4 w-4" />} label="Categories" value={categories.toString()} />
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Total Followers" value={formatFollowers(totalFollowers)} />
        </div>

        {/* API Cost Tracker */}
        <CostTrackerCard />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent KOLs */}
          <Card className="lg:col-span-2 bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Recently Added
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {recentKols.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-muted-foreground text-sm">No KOLs yet.</p>
                  <button
                    onClick={() => setLocation("/kols")}
                    className="mt-2 text-xs text-primary hover:underline"
                  >
                    Import from CSV →
                  </button>
                </div>
              ) : (
                recentKols.map(kol => (
                  <div
                    key={kol.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-secondary/40 cursor-pointer transition-colors group"
                    onClick={() => setLocation(`/kols/${kol.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                        {(kol.displayName || kol.handle).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {kol.displayName || kol.handle}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          @{kol.handle} · {kol.platform}
                          {kol.region ? ` · ${kol.region}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {kol.followers != null && (
                        <span className="text-xs text-muted-foreground hidden sm:block">
                          {formatFollowers(kol.followers)}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        kol.status === "active"
                          ? "bg-primary/15 text-primary"
                          : kol.status === "inactive"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {kol.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Breakdown */}
          <div className="space-y-4">
            <BreakdownCard title="By Region" data={regionBreakdown} total={totalKols} />
            <BreakdownCard title="By Category" data={categoryBreakdown} total={totalKols} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatCard({ icon, label, value, highlight }: {
  icon: React.ReactNode; label: string; value: string; highlight?: boolean;
}) {
  return (
    <Card className={`bg-card border-border ${highlight ? "border-primary/30" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">{label}</span>
          <span className={highlight ? "text-primary" : "text-muted-foreground"}>{icon}</span>
        </div>
        <p className={`text-2xl font-bold ${highlight ? "text-primary" : "text-foreground"}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function BreakdownCard({ title, data, total }: {
  title: string; data: Record<string, number>; total: number;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-xs">No data yet.</p>
        ) : (
          entries.map(([key, count]) => (
            <div key={key}>
              <div className="flex justify-between mb-0.5">
                <span className="text-xs text-foreground truncate max-w-[120px]">{key}</span>
                <span className="text-xs text-muted-foreground">{count}</span>
              </div>
              <div className="h-1 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: total > 0 ? `${(count / total) * 100}%` : "0%" }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function CostTrackerCard() {
  const { data: stats, isLoading } = trpc.usage.getStats.useQuery();

  const opLabels: Record<string, string> = {
    search: "Tweet Search",
    enrich_profile: "Profile Enrichment",
    enrich_timeline: "Timeline Fetch",
  };

  const totalUsd = stats?.totalCostUsd ?? 0;
  const totalCredits = stats?.totalCredits ?? 0;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5" />
            twitterapi.io Usage &amp; Cost
          </CardTitle>
          <span className="text-xs text-muted-foreground">1 USD = 100,000 credits</span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-12 bg-secondary/30 rounded animate-pulse" />
        ) : (
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Total spend */}
            <div className="flex items-center gap-3 min-w-[160px]">
              <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Spend</p>
                <p className="text-xl font-bold text-foreground">${totalUsd.toFixed(4)}</p>
                <p className="text-xs text-muted-foreground">{totalCredits.toLocaleString()} credits</p>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px bg-border" />

            {/* Per-operation breakdown */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 items-center">
              {(stats?.byOperation ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No API calls yet. Run a search or enrich a KOL to see usage.</p>
              ) : (
                (stats?.byOperation ?? []).map(op => (
                  <div key={op.operation} className="flex items-center gap-2">
                    <Zap className="h-3 w-3 text-primary/60 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-foreground">{opLabels[op.operation] ?? op.operation}</p>
                      <p className="text-xs text-muted-foreground">
                        {op.calls} call{op.calls !== 1 ? "s" : ""} · {op.itemCount.toLocaleString()} items · ${op.costUsd.toFixed(4)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
