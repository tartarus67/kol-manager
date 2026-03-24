import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import {
  FolderOpen, FolderPlus, Pencil, Trash2, Users, ChevronRight, X,
  BarChart2, Download, Sparkles, Loader2, CheckSquare, Square,
  ChevronDown,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function fmtFollowers(n: number | null | undefined): string {
  if (n == null) return "—";
  return fmt(n);
}

// ─── Folder Dashboard ─────────────────────────────────────────────────────────

function FolderDashboard({ folderId }: { folderId: number }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<number[]>([]);
  const [keywordsLoading, setKeywordsLoading] = useState(false);
  const [keywords, setKeywords] = useState<string[] | null>(null);

  const { data: campaigns = [] } = trpc.campaign.list.useQuery();

  const statsInput = useMemo(() => ({
    folderId,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    campaignIds: selectedCampaignIds.length > 0 ? selectedCampaignIds : undefined,
  }), [folderId, startDate, endDate, selectedCampaignIds]);

  const { data: stats, isLoading: statsLoading } = trpc.folderDashboard.getStats.useQuery(statsInput);
  const { data: top20 = [], isLoading: top20Loading } = trpc.folderDashboard.getTop20.useQuery(statsInput);

  const keywordsMutation = trpc.folderDashboard.getKeywords.useMutation({
    onSuccess: (data) => {
      setKeywords(data.keywords);
      setKeywordsLoading(false);
    },
    onError: () => {
      toast.error("Failed to generate keywords");
      setKeywordsLoading(false);
    },
  });

  function handleGetKeywords() {
    setKeywordsLoading(true);
    setKeywords(null);
    keywordsMutation.mutate(statsInput);
  }

  function toggleCampaign(id: number) {
    setSelectedCampaignIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function exportTop20Csv() {
    if (!top20.length) return;
    const headers = ["Handle", "Name", "Posts", "Impressions", "Likes", "Retweets", "Quotes", "Saves"];
    const rows = top20.map(r => [
      r.handle, r.displayName ?? "", r.postCount,
      r.totalImpressions, r.totalLikes, r.totalRetweets, r.totalQuotes, r.totalSaves,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "top20_contributors.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const metricCards = stats ? [
    { label: "Total Impressions", value: fmt(stats.totalImpressions) },
    { label: "Total Likes", value: fmt(stats.totalLikes) },
    { label: "Total Retweets", value: fmt(stats.totalRetweets) },
    { label: "Total Quotes", value: fmt(stats.totalQuotes) },
    { label: "Total Saves", value: fmt(stats.totalSaves) },
    { label: "Total Posts", value: fmt(stats.totalPosts) },
    { label: "Total Budget", value: stats.totalBudget > 0 ? `$${stats.totalBudget.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—" },
    { label: "CPM", value: stats.cpm != null ? `$${stats.cpm.toFixed(2)}` : "—" },
    { label: "CPP", value: stats.cpp != null ? `$${stats.cpp.toFixed(2)}` : "—" },
  ] : [];

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Start Date</label>
          <Input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="bg-secondary border-border text-foreground w-36 text-xs"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">End Date</label>
          <Input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="bg-secondary border-border text-foreground w-36 text-xs"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Campaigns</label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="border-border text-foreground bg-secondary gap-1.5 text-xs">
                {selectedCampaignIds.length === 0 ? "All Campaigns" : `${selectedCampaignIds.length} selected`}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-card border-border text-foreground w-52 max-h-64 overflow-y-auto">
              <DropdownMenuItem
                className="text-xs text-muted-foreground cursor-pointer"
                onClick={() => setSelectedCampaignIds([])}
              >
                Clear selection (All)
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              {campaigns.map(c => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={selectedCampaignIds.includes(c.id)}
                  onCheckedChange={() => toggleCampaign(c.id)}
                  className="text-xs cursor-pointer"
                >
                  {c.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {(startDate || endDate || selectedCampaignIds.length > 0) && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => { setStartDate(""); setEndDate(""); setSelectedCampaignIds([]); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Metric Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-16 bg-secondary animate-pulse rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {metricCards.map(card => (
            <div key={card.label} className="bg-secondary/40 border border-border rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{card.label}</p>
              <p className="text-lg font-bold text-foreground">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Top 20 Contributors */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-foreground">Top 20 Contributors</h3>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs border-border text-foreground" onClick={exportTop20Csv} disabled={!top20.length}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
        {top20Loading ? (
          <div className="h-32 bg-secondary animate-pulse rounded-lg" />
        ) : top20.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center border border-border rounded-lg">
            No data yet. Add KOLs to this folder and run campaigns to see contributors.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wider">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wider">KOL</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase tracking-wider">Posts</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase tracking-wider">Impressions</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase tracking-wider">Likes</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase tracking-wider">RT</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase tracking-wider">QT</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase tracking-wider">Saves</th>
                </tr>
              </thead>
              <tbody>
                {top20.map((row, i) => (
                  <tr key={row.kolId} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                    <td className="px-3 py-2 text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div>
                        <p className="font-medium text-foreground">{row.displayName ?? row.handle}</p>
                        <p className="text-[10px] text-muted-foreground">@{row.handle}</p>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">{fmt(row.postCount)}</td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">{fmt(row.totalImpressions)}</td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">{fmt(row.totalLikes)}</td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">{fmt(row.totalRetweets)}</td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">{fmt(row.totalQuotes)}</td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">{fmt(row.totalSaves)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI Keywords */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-foreground">Top 20 Keywords</h3>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs border-border text-foreground"
            onClick={handleGetKeywords}
            disabled={keywordsLoading}
          >
            {keywordsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {keywordsLoading ? "Analyzing..." : "AI Summarize"}
          </Button>
        </div>
        {keywords === null ? (
          <div className="text-xs text-muted-foreground py-4 text-center border border-border rounded-lg border-dashed">
            Click "AI Summarize" to extract top keywords from tweet content in this folder.
          </div>
        ) : keywords.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center border border-border rounded-lg">
            No tweet content found for the selected filters.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw, i) => (
              <span
                key={i}
                className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium"
              >
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Folders page ────────────────────────────────────────────────────────

export default function Folders() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [createOpen, setCreateOpen] = useState(false);
  const [editFolder, setEditFolder] = useState<{ id: number; name: string; description: string | null } | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [dashboardFolderId, setDashboardFolderId] = useState<number | null>(null);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Bulk select state for KOLs in expanded folder
  const [selectedKolIds, setSelectedKolIds] = useState<Set<number>>(new Set());

  const { data: folders = [], isLoading } = trpc.folder.list.useQuery();
  const { data: folderKols = [], isLoading: kolsLoading } = trpc.folder.getKols.useQuery(
    { folderId: expandedId ?? 0 },
    { enabled: expandedId !== null }
  );

  const createMutation = trpc.folder.create.useMutation({
    onSuccess: () => {
      utils.folder.list.invalidate();
      toast.success("Folder created");
      setCreateOpen(false);
      setNewName(""); setNewDesc("");
    },
    onError: () => toast.error("Failed to create folder"),
  });

  const updateMutation = trpc.folder.update.useMutation({
    onSuccess: () => {
      utils.folder.list.invalidate();
      toast.success("Folder updated");
      setEditFolder(null);
    },
    onError: () => toast.error("Failed to update folder"),
  });

  const deleteMutation = trpc.folder.delete.useMutation({
    onSuccess: () => {
      utils.folder.list.invalidate();
      toast.success("Folder deleted");
      setDeleteId(null);
      if (expandedId === deleteId) setExpandedId(null);
    },
    onError: () => toast.error("Failed to delete folder"),
  });

  const removeKolMutation = trpc.folder.removeKol.useMutation({
    onSuccess: () => {
      utils.folder.getKols.invalidate({ folderId: expandedId ?? 0 });
      utils.folder.list.invalidate();
      toast.success("KOL removed from folder");
    },
    onError: () => toast.error("Failed to remove KOL"),
  });

  const removeKolsMutation = trpc.folder.removeKols.useMutation({
    onSuccess: () => {
      utils.folder.getKols.invalidate({ folderId: expandedId ?? 0 });
      utils.folder.list.invalidate();
      setSelectedKolIds(new Set());
      toast.success("KOLs removed from folder");
    },
    onError: () => toast.error("Failed to remove KOLs"),
  });

  function openEdit(f: { id: number; name: string; description: string | null }) {
    setEditFolder(f);
    setEditName(f.name);
    setEditDesc(f.description ?? "");
  }

  function toggleKolSelect(id: number) {
    setSelectedKolIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedKolIds.size === folderKols.length) {
      setSelectedKolIds(new Set());
    } else {
      setSelectedKolIds(new Set(folderKols.map((k: any) => k.id)));
    }
  }

  function exportFolderKolsCsv(folderId: number) {
    const folder = folders.find(f => f.id === folderId);
    if (!folderKols.length) return;
    const headers = ["Handle", "Display Name", "Platform", "Region", "Followers", "Status"];
    const rows = folderKols.map((k: any) => [
      k.handle, k.displayName ?? "", k.platform ?? "", k.region ?? "",
      k.followers ?? "", k.status ?? "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(folder?.name ?? "folder").replace(/[^a-z0-9]/gi, "_")}_kols.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 p-2">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Folders</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Organize KOLs by agency, campaign, or group
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
          >
            <FolderPlus className="h-4 w-4" />
            New Folder
          </Button>
        </div>

        {/* Dashboard panel */}
        {dashboardFolderId !== null && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-1">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-foreground">
                  Dashboard — {folders.find(f => f.id === dashboardFolderId)?.name}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setDashboardFolderId(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <FolderDashboard folderId={dashboardFolderId} />
          </div>
        )}

        {/* Folder list */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-secondary animate-pulse rounded-lg" />
            ))}
          </div>
        ) : folders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground text-sm">No folders yet.</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Create a folder to organize KOLs by agency or group.
            </p>
            <Button
              onClick={() => setCreateOpen(true)}
              className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            >
              <FolderPlus className="h-4 w-4" />
              Create First Folder
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {folders.map(folder => (
              <div key={folder.id} className="rounded-lg border border-border overflow-hidden">
                {/* Folder row */}
                <div
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/30 transition-colors ${expandedId === folder.id ? "bg-secondary/20" : ""}`}
                  onClick={() => {
                    setExpandedId(expandedId === folder.id ? null : folder.id);
                    setSelectedKolIds(new Set());
                  }}
                >
                  <FolderOpen className={`h-5 w-5 shrink-0 ${expandedId === folder.id ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{folder.name}</p>
                    {folder.description && (
                      <p className="text-xs text-muted-foreground truncate">{folder.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {folder.kolCount}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); setDashboardFolderId(dashboardFolderId === folder.id ? null : folder.id); }}
                      className={`p-1.5 rounded transition-colors ${dashboardFolderId === folder.id ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground hover:text-foreground"}`}
                      title="Dashboard"
                    >
                      <BarChart2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); exportFolderKolsCsv(folder.id); }}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Export KOLs to CSV"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); openEdit(folder); }}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteId(folder.id); }}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedId === folder.id ? "rotate-90" : ""}`} />
                  </div>
                </div>

                {/* Expanded KOL list */}
                {expandedId === folder.id && (
                  <div className="border-t border-border bg-secondary/10">
                    {/* Bulk action bar */}
                    {selectedKolIds.size > 0 && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-primary/20">
                        <span className="text-xs text-primary font-medium">{selectedKolIds.size} selected</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs gap-1 border-border text-foreground"
                          onClick={() => exportFolderKolsCsv(folder.id)}
                        >
                          <Download className="h-3 w-3" />
                          Export CSV
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                          onClick={() => removeKolsMutation.mutate({ folderId: folder.id, kolIds: Array.from(selectedKolIds) })}
                          disabled={removeKolsMutation.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove from folder
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs text-muted-foreground"
                          onClick={() => setSelectedKolIds(new Set())}
                        >
                          Clear
                        </Button>
                      </div>
                    )}

                    {kolsLoading ? (
                      <div className="p-4 text-xs text-muted-foreground animate-pulse">Loading KOLs...</div>
                    ) : folderKols.length === 0 ? (
                      <div className="p-4 text-xs text-muted-foreground">
                        No KOLs in this folder yet. Add KOLs from the KOL Database page.
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/50">
                            <th className="px-3 py-2 w-8">
                              <button onClick={e => { e.stopPropagation(); toggleSelectAll(); }}>
                                {selectedKolIds.size === folderKols.length
                                  ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                                  : <Square className="h-3.5 w-3.5 text-muted-foreground" />}
                              </button>
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">KOL</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Platform</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Region</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Followers</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                            <th className="px-4 py-2 w-10" />
                          </tr>
                        </thead>
                        <tbody>
                          {folderKols.map((kol: any) => (
                            <tr
                              key={kol.id}
                              className={`border-b border-border/30 hover:bg-secondary/20 transition-colors ${selectedKolIds.has(kol.id) ? "bg-primary/5" : ""}`}
                            >
                              <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                                <button onClick={() => toggleKolSelect(kol.id)}>
                                  {selectedKolIds.has(kol.id)
                                    ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                                    : <Square className="h-3.5 w-3.5 text-muted-foreground" />}
                                </button>
                              </td>
                              <td className="px-4 py-2.5 cursor-pointer" onClick={() => setLocation(`/kols/${kol.id}`)}>
                                <div className="flex items-center gap-2">
                                  <div className="h-6 w-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                                    {(kol.displayName || kol.handle).charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium text-foreground text-xs truncate max-w-[120px]">
                                      {kol.displayName || kol.handle}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">@{kol.handle}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground">{kol.platform}</td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground">{kol.region || "—"}</td>
                              <td className="px-4 py-2.5 text-xs font-mono text-foreground">
                                {fmtFollowers(kol.followers)}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                                  kol.status === "active" ? "bg-primary/15 text-primary border-primary/20"
                                  : kol.status === "inactive" ? "bg-destructive/15 text-destructive border-destructive/20"
                                  : "bg-muted text-muted-foreground border-border"
                                }`}>
                                  {kol.status}
                                </span>
                              </td>
                              <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => removeKolMutation.mutate({ folderId: folder.id, kolId: kol.id })}
                                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                  title="Remove from folder"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Folder Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
              <Input
                placeholder="e.g. Aethir Internal, Agency XYZ..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="bg-secondary border-border text-foreground"
                onKeyDown={e => e.key === "Enter" && newName.trim() && createMutation.mutate({ name: newName.trim(), description: newDesc.trim() || undefined })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description (optional)</label>
              <Input
                placeholder="Short description..."
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                className="bg-secondary border-border text-foreground"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="border-border text-foreground hover:bg-secondary">Cancel</Button>
            <Button
              disabled={!newName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ name: newName.trim(), description: newDesc.trim() || undefined })}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Folder Modal */}
      <Dialog open={!!editFolder} onOpenChange={open => !open && setEditFolder(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="bg-secondary border-border text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} className="bg-secondary border-border text-foreground" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditFolder(null)} className="border-border text-foreground hover:bg-secondary">Cancel</Button>
            <Button
              disabled={!editName.trim() || updateMutation.isPending}
              onClick={() => editFolder && updateMutation.mutate({ id: editFolder.id, name: editName.trim(), description: editDesc.trim() || undefined, color: undefined })}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              The folder will be deleted. KOLs inside will not be deleted — they remain in the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground hover:bg-secondary">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
