import { useState, useMemo, useRef } from "react";
import { ColumnHeader, SortDir as ColSortDir } from "@/components/ColumnHeader";
import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  PlusIcon, Trash2Icon, RefreshCwIcon, ExternalLinkIcon,
  PencilIcon, UploadIcon, ChevronRightIcon, DollarSignIcon,
  CheckSquare, Square, Download, Paperclip,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtUsd(v: string | number | null | undefined) {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusColor(s: string) {
  if (s === "active") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (s === "completed") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
}

function fetchStatusColor(s: string) {
  if (s === "done") return "bg-green-500/20 text-green-400";
  if (s === "failed") return "bg-red-500/20 text-red-400";
  return "bg-yellow-500/20 text-yellow-400";
}

// ─── Campaign List ────────────────────────────────────────────────────────────

export default function Campaigns() {
  const utils = trpc.useUtils();

  const { data: campaigns = [], isLoading } = trpc.campaign.list.useQuery();

  // Create campaign dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newBudget, setNewBudget] = useState("");
  const [newStatus, setNewStatus] = useState<"active" | "completed" | "draft">("active");

  const createMutation = trpc.campaign.create.useMutation({
    onSuccess: () => {
      utils.campaign.list.invalidate();
      setCreateOpen(false);
      setNewName(""); setNewDesc(""); setNewBudget(""); setNewStatus("active");
      toast.success("Campaign created");
    },
    onError: (e) => toast.error(e.message),
  });

  // Delete campaign
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const deleteMutation = trpc.campaign.delete.useMutation({
    onSuccess: () => {
      utils.campaign.list.invalidate();
      setDeleteId(null);
      toast.success("Campaign deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  // Selected campaign for detail view
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (selectedId !== null) {
    return <CampaignDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Campaigns</h1>
            <p className="text-sm text-muted-foreground mt-1">Track past performance and KOL post history</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="bg-yellow-400 text-black hover:bg-yellow-300 font-semibold">
            <PlusIcon className="w-4 h-4 mr-2" />
            New Campaign
          </Button>
        </div>

        {/* Campaign cards */}
        {isLoading ? (
          <div className="text-muted-foreground text-sm">Loading...</div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg font-medium">No campaigns yet</p>
            <p className="text-sm mt-1">Create a campaign to start tracking KOL post performance</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map(c => (
              <div
                key={c.id}
                className="bg-card border border-border rounded-lg p-4 hover:border-yellow-400/50 transition-colors cursor-pointer group"
                onClick={() => setSelectedId(c.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-foreground group-hover:text-yellow-400 transition-colors line-clamp-1">{c.name}</h3>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <Badge className={`text-xs border ${statusColor(c.status)}`}>{c.status}</Badge>
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteId(c.id); }}
                      className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2Icon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {c.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{c.description}</p>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <DollarSignIcon className="w-3 h-3" />
                    Budget: {fmtUsd(c.budget)}
                  </span>
                  <ChevronRightIcon className="w-4 h-4 group-hover:text-yellow-400 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle>New Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Campaign Name *</label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Aethir Q1 2025 KOL Push"
                className="bg-secondary border-border"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <Textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Optional notes about this campaign"
                className="bg-secondary border-border resize-none"
                rows={2}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Total Budget (USD)</label>
              <Input
                type="number"
                value={newBudget}
                onChange={e => setNewBudget(e.target.value)}
                placeholder="e.g. 5000"
                className="bg-secondary border-border"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status</label>
              <Select value={newStatus} onValueChange={v => setNewStatus(v as any)}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate({
                name: newName.trim(),
                description: newDesc.trim() || undefined,
                budget: newBudget ? parseFloat(newBudget) : undefined,
                status: newStatus,
              })}
              disabled={!newName.trim() || createMutation.isPending}
              className="bg-yellow-400 text-black hover:bg-yellow-300 font-semibold"
            >
              {createMutation.isPending ? "Creating..." : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete the campaign and all its imported posts. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground hover:bg-secondary">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

// ─── Campaign Detail ──────────────────────────────────────────────────────────

function CampaignDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.campaign.getById.useQuery({ id });
  const campaign = data?.campaign;
  const posts = data?.posts ?? [];

  // Edit campaign
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editBudget, setEditBudget] = useState("");
  const [editStatus, setEditStatus] = useState<"active" | "completed" | "draft">("active");

  function openEdit() {
    if (!campaign) return;
    setEditName(campaign.name);
    setEditDesc(campaign.description ?? "");
    setEditBudget(campaign.budget != null ? String(campaign.budget) : "");
    setEditStatus(campaign.status);
    setEditOpen(true);
  }

  const updateMutation = trpc.campaign.update.useMutation({
    onSuccess: () => {
      utils.campaign.getById.invalidate({ id });
      setEditOpen(false);
      toast.success("Campaign updated");
    },
    onError: (e) => toast.error(e.message),
  });

  // Import URLs
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBudget, setImportBudget] = useState("");
  const importFileRef = useRef<HTMLInputElement>(null);
  function handleImportFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      setImportText(lines.join("\n"));
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const importMutation = trpc.campaign.importUrls.useMutation({
    onSuccess: (res) => {
      utils.campaign.getById.invalidate({ id });
      // Invalidate all KOL profiles so their metrics auto-refresh
      utils.kol.getById.invalidate();
      setImportOpen(false);
      setImportText(""); setImportBudget("");
      toast.success(`Imported ${res.inserted} post${res.inserted !== 1 ? "s" : ""}`);
    },
    onError: (e) => toast.error(e.message),
  });

  function handleImport() {
    const lines = importText.split("\n").map(l => l.trim()).filter(Boolean);
    const budget = importBudget ? parseFloat(importBudget) : undefined;
    const urls = lines.map(url => ({ url, budget }));
    if (urls.length === 0) return;
    importMutation.mutate({ campaignId: id, urls });
  }

  // Fetch metrics
  const fetchMetricsMutation = trpc.campaign.fetchMetrics.useMutation({
    onSuccess: (res) => {
      utils.campaign.getById.invalidate({ id });
      // Invalidate all KOL profiles so their top-line metrics auto-refresh
      utils.kol.getById.invalidate();
      utils.kol.list.invalidate();
      toast.success(`Fetched metrics: ${res.done} done, ${res.failed} failed`);
    },
    onError: (e) => toast.error(e.message),
  });

  // Edit post budget inline
  const [editPostId, setEditPostId] = useState<number | null>(null);
  const [editPostBudget, setEditPostBudget] = useState("");

  const updatePostMutation = trpc.campaign.updatePost.useMutation({
    onSuccess: () => {
      utils.campaign.getById.invalidate({ id });
      utils.kol.getById.invalidate();
      setEditPostId(null);
      toast.success("Post budget updated");
    },
    onError: (e) => toast.error(e.message),
  });

  // Delete post
  const deletePostMutation = trpc.campaign.deletePost.useMutation({
    onSuccess: () => {
      utils.campaign.getById.invalidate({ id });
      utils.kol.getById.invalidate();
      utils.kol.list.invalidate();
      toast.success("Post removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const pendingCount = posts.filter(p => p.fetchStatus === "pending").length;

  // ─── Bulk select ─────────────────────────────────────────────────────────
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  function toggleRow(postId: number) {
    setSelectedRows(prev => { const n = new Set(prev); if (n.has(postId)) n.delete(postId); else n.add(postId); return n; });
  }
  function toggleAll() {
    if (selectedRows.size === displayedPosts.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(displayedPosts.map(p => p.id)));
  }
  function exportSelectedCsv() {
    const sel = selectedRows.size > 0
      ? displayedPosts.filter(p => selectedRows.has(p.id))
      : displayedPosts;
    const headers = ["KOL Handle", "Tweet URL", "Tweet Text", "Views", "Likes", "RT", "Replies", "QT", "Saves", "Budget", "Status"];
    const csvRows = sel.map(p => [
      p.kolHandle ?? "", p.tweetUrl ?? "", p.tweetText ?? "",
      p.views ?? "", p.likes ?? "", p.retweets ?? "",
      p.replies ?? "", p.quotes ?? "", p.bookmarks ?? "",
      p.budget ?? "", p.fetchStatus ?? "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${campaign?.name ?? "campaign"}_posts.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Column sort/filter ───────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<ColSortDir>(null);
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({});

  function handleColSort(key: string, dir: ColSortDir) {
    setSortKey(dir ? key : null);
    setSortDir(dir);
  }

  function setColFilter(key: string, values: Set<string>) {
    setColFilters(prev => ({ ...prev, [key]: values }));
  }

  const colValues = useMemo(() => ({
    kolHandle: Array.from(new Set(posts.map(p => p.kolHandle ?? ""))).sort(),
    fetchStatus: Array.from(new Set(posts.map(p => p.fetchStatus ?? ""))).sort(),
  }), [posts]);

  const displayedPosts = useMemo(() => {
    let list = [...posts];
    for (const [key, values] of Object.entries(colFilters)) {
      if (values.size === 0) continue;
      list = list.filter(p => values.has(String((p as any)[key] ?? "")));
    }
    if (sortKey && sortDir) {
      list.sort((a, b) => {
        let av: any = (a as any)[sortKey];
        let bv: any = (b as any)[sortKey];
        if (av == null) av = sortDir === "asc" ? Infinity : -Infinity;
        if (bv == null) bv = sortDir === "asc" ? Infinity : -Infinity;
        if (typeof av === "string") av = av.toLowerCase();
        if (typeof bv === "string") bv = bv.toLowerCase();
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [posts, sortKey, sortDir, colFilters]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 text-muted-foreground text-sm">Loading...</div>
      </DashboardLayout>
    );
  }

  if (!campaign) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Button variant="outline" onClick={onBack}>← Back</Button>
          <p className="text-muted-foreground mt-4">Campaign not found.</p>
        </div>
      </DashboardLayout>
    );
  }

  // Aggregate totals
  const donePosts = posts.filter(p => p.fetchStatus === "done");
  const totalViews = donePosts.reduce((s, p) => s + (p.views ?? 0), 0);
  const totalLikes = donePosts.reduce((s, p) => s + (p.likes ?? 0), 0);
  const totalRt = donePosts.reduce((s, p) => s + (p.retweets ?? 0), 0);
  const totalBudget = posts.reduce((s, p) => s + (p.budget ? parseFloat(String(p.budget)) : 0), 0);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onBack} className="border-border text-foreground hover:bg-secondary">
              ← Back
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
                <Badge className={`text-xs border ${statusColor(campaign.status)}`}>{campaign.status}</Badge>
              </div>
              {campaign.description && (
                <p className="text-sm text-muted-foreground mt-0.5">{campaign.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={openEdit} className="border-border text-foreground hover:bg-secondary">
              <PencilIcon className="w-3.5 h-3.5 mr-1.5" />
              Edit
            </Button>
            <Button
              size="sm"
              onClick={() => setImportOpen(true)}
              className="bg-yellow-400 text-black hover:bg-yellow-300 font-semibold"
            >
              <UploadIcon className="w-3.5 h-3.5 mr-1.5" />
              Import URLs
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchMetricsMutation.mutate({ campaignId: id })}
              disabled={fetchMetricsMutation.isPending}
              className="border-border text-foreground hover:bg-secondary"
            >
              <RefreshCwIcon className={`w-3.5 h-3.5 mr-1.5 ${fetchMetricsMutation.isPending ? "animate-spin" : ""}`} />
              {fetchMetricsMutation.isPending ? "Refreshing..." : "Refresh Metrics"}
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Posts", value: String(posts.length) },
            { label: "Total Views", value: fmtNum(totalViews) },
            { label: "Total Likes", value: fmtNum(totalLikes) },
            { label: "Total Retweets", value: fmtNum(totalRt) },
            { label: "Campaign Budget", value: campaign.budget ? fmtUsd(campaign.budget) : "—" },
          ].map(stat => (
            <div key={stat.label} className="bg-card border border-border rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Posts table */}
        {posts.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="font-medium">No posts imported yet</p>
            <p className="text-sm mt-1">Click "Import URLs" to add tweet URLs for this campaign</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Bulk action bar */}
            {selectedRows.size > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
                <span className="text-xs text-primary font-medium">{selectedRows.size} selected</span>
                <Button size="sm" variant="outline" className="h-6 text-xs gap-1 border-border text-foreground" onClick={exportSelectedCsv}>
                  <Download className="h-3 w-3" /> Export CSV
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive hover:text-destructive"
                  onClick={() => {
                    if (!confirm(`Delete ${selectedRows.size} selected posts?`)) return;
                    Promise.all([...selectedRows].map(pid => deletePostMutation.mutateAsync({ id: pid })))
                      .then(() => setSelectedRows(new Set()))
                      .catch(() => {});
                  }}
                >
                  <Trash2Icon className="h-3 w-3 mr-1" /> Delete
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={() => setSelectedRows(new Set())}>Clear</Button>
              </div>
            )}
            {/* Export all button */}
            <div className="flex justify-end">
              <Button size="sm" variant="outline" className="border-border text-foreground gap-1.5" onClick={exportSelectedCsv}>
                <Download className="w-3.5 h-3.5" /> Export CSV
              </Button>
            </div>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-8">
                    <button onClick={toggleAll}>
                      {selectedRows.size === displayedPosts.length && displayedPosts.length > 0
                        ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                        : <Square className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  </TableHead>
                  <TableHead><ColumnHeader label="KOL" sortKey="kolHandle" sortDir={sortKey==="kolHandle"?sortDir:null} onSort={handleColSort} filterValues={colValues.kolHandle} selectedValues={colFilters.kolHandle??new Set()} onFilterChange={(v)=>setColFilter("kolHandle",v)} /></TableHead>
                  <TableHead className="text-muted-foreground">Tweet</TableHead>
                  <TableHead className="text-right"><ColumnHeader label="Views" sortKey="views" sortDir={sortKey==="views"?sortDir:null} onSort={handleColSort} /></TableHead>
                  <TableHead className="text-right"><ColumnHeader label="Likes" sortKey="likes" sortDir={sortKey==="likes"?sortDir:null} onSort={handleColSort} /></TableHead>
                  <TableHead className="text-right"><ColumnHeader label="RT" sortKey="retweets" sortDir={sortKey==="retweets"?sortDir:null} onSort={handleColSort} /></TableHead>
                  <TableHead className="text-right"><ColumnHeader label="Replies" sortKey="replies" sortDir={sortKey==="replies"?sortDir:null} onSort={handleColSort} /></TableHead>
                  <TableHead className="text-right"><ColumnHeader label="QT" sortKey="quotes" sortDir={sortKey==="quotes"?sortDir:null} onSort={handleColSort} /></TableHead>
                  <TableHead className="text-right"><ColumnHeader label="Saves" sortKey="bookmarks" sortDir={sortKey==="bookmarks"?sortDir:null} onSort={handleColSort} /></TableHead>
                  <TableHead className="text-right"><ColumnHeader label="Budget" sortKey="budget" sortDir={sortKey==="budget"?sortDir:null} onSort={handleColSort} /></TableHead>
                  <TableHead className="text-center"><ColumnHeader label="Status" sortKey="fetchStatus" sortDir={sortKey==="fetchStatus"?sortDir:null} onSort={handleColSort} filterValues={colValues.fetchStatus} selectedValues={colFilters.fetchStatus??new Set()} onFilterChange={(v)=>setColFilter("fetchStatus",v)} /></TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedPosts.map(post => (
                  <TableRow key={post.id} className={`border-border hover:bg-secondary/30 ${selectedRows.has(post.id) ? 'bg-primary/5' : ''}`}>
                    <TableCell className="w-8">
                      <button onClick={() => toggleRow(post.id)}>
                        {selectedRows.has(post.id)
                          ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                          : <Square className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-foreground">
                      {post.kolHandle ? (
                        <a
                          href={`https://x.com/${post.kolHandle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-yellow-400 hover:underline"
                        >
                          @{post.kolHandle}
                        </a>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={post.tweetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline text-xs truncate"
                        >
                          {post.tweetText ? post.tweetText.slice(0, 60) + (post.tweetText.length > 60 ? "…" : "") : post.tweetUrl.slice(0, 40) + "…"}
                        </a>
                        <ExternalLinkIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm">{fmtNum(post.views)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtNum(post.likes)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtNum(post.retweets)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtNum(post.replies)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtNum(post.quotes)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtNum(post.bookmarks)}</TableCell>
                    <TableCell className="text-right text-sm">
                      {editPostId === post.id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <Input
                            type="number"
                            value={editPostBudget}
                            onChange={e => setEditPostBudget(e.target.value)}
                            className="w-20 h-6 text-xs bg-secondary border-border px-1"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            className="h-6 px-2 text-xs bg-yellow-400 text-black hover:bg-yellow-300"
                            onClick={() => updatePostMutation.mutate({
                              id: post.id,
                              budget: editPostBudget ? parseFloat(editPostBudget) : null,
                            })}
                          >✓</Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs border-border"
                            onClick={() => setEditPostId(null)}
                          >✕</Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditPostId(post.id); setEditPostBudget(post.budget != null ? String(post.budget) : ""); }}
                          className="hover:text-yellow-400 transition-colors"
                        >
                          {fmtUsd(post.budget)}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={`text-xs ${fetchStatusColor(post.fetchStatus)}`}>
                        {post.fetchStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => deletePostMutation.mutate({ id: post.id })}
                        className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2Icon className="w-3.5 h-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </div>
        )}
      </div>

      {/* Edit campaign dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Campaign Name *</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="bg-secondary border-border resize-none" rows={2} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Total Budget (USD)</label>
              <Input type="number" value={editBudget} onChange={e => setEditBudget(e.target.value)} placeholder="e.g. 5000" className="bg-secondary border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status</label>
              <Select value={editStatus} onValueChange={v => setEditStatus(v as any)}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={() => updateMutation.mutate({
                id,
                name: editName.trim(),
                description: editDesc.trim() || undefined,
                budget: editBudget ? parseFloat(editBudget) : null,
                status: editStatus,
              })}
              disabled={!editName.trim() || updateMutation.isPending}
              className="bg-yellow-400 text-black hover:bg-yellow-300 font-semibold"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import URLs dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Import Tweet URLs</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0 pr-1">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">Tweet URLs — one per line</label>
                <button
                  onClick={() => importFileRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Paperclip className="w-3 h-3" /> Upload CSV/TXT
                </button>
                <input ref={importFileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleImportFileUpload} />
              </div>
              <Textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder={"https://x.com/user/status/123456789\nhttps://x.com/user2/status/987654321\n..."}
                className="bg-secondary border-border font-mono text-xs resize-none h-40 max-h-60 overflow-y-auto"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {importText.split("\n").filter(l => l.trim()).length} URLs detected
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Per-post Budget (USD) — applies to all imported posts
              </label>
              <Input
                type="number"
                value={importBudget}
                onChange={e => setImportBudget(e.target.value)}
                placeholder="e.g. 200 (leave blank for no budget)"
                className="bg-secondary border-border"
              />
              <p className="text-xs text-muted-foreground mt-1">You can edit individual post budgets after import.</p>
            </div>
          </div>
          <DialogFooter className="shrink-0 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button
              onClick={handleImport}
              disabled={!importText.trim() || importMutation.isPending}
              className="bg-yellow-400 text-black hover:bg-yellow-300 font-semibold"
            >
              {importMutation.isPending ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
