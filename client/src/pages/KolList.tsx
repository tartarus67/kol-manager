import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { trpc } from "@/lib/trpc";
import {
  Search, Upload, Trash2, Eye, ChevronUp, ChevronDown, X,
  FolderPlus, CheckSquare, Zap, UserPlus, Pencil, Download,
} from "lucide-react";
import { useState, useRef, useMemo } from "react";
import { ColumnHeader, SortDir as ColSortDir } from "@/components/ColumnHeader";
import { useLocation } from "wouter";
import { toast } from "sonner";

type SortField = "displayName" | "followers" | "engagementRate" | "region" | "category" | "status" | "postLanguage";
type SortDir = "asc" | "desc";

function formatNum(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

const statusColors: Record<string, string> = {
  active: "bg-primary/15 text-primary border-primary/20",
  inactive: "bg-destructive/15 text-destructive border-destructive/20",
  pending: "bg-muted text-muted-foreground border-border",
};

const enrichColors: Record<string, string> = {
  done: "text-primary",
  pending: "text-yellow-400",
  failed: "text-destructive",
  never: "text-muted-foreground",
};

export default function KolList() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // ─── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // ─── Sort ──────────────────────────────────────────────────────────────────
  const [sortField, setSortField] = useState<SortField>("displayName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // ─── Column filters (checkbox value selection) ─────────────────────────────
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({}); 

  function setColFilter(key: string, values: Set<string>) {
    setColFilters(prev => ({ ...prev, [key]: values }));
  }

  function handleColSort(key: string, dir: ColSortDir) {
    if (dir === null) { setSortField("displayName"); setSortDir("asc"); return; }
    setSortField(key as SortField);
    setSortDir(dir as SortDir);
  }

  // ─── Selection ─────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // ─── Modals ────────────────────────────────────────────────────────────────
  const [importMode, setImportMode] = useState<"handles" | "csv" | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkFolderOpen, setBulkFolderOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<"active" | "inactive" | "pending">("active");

  // ─── Handle import state ───────────────────────────────────────────────────
  const [handleText, setHandleText] = useState("");
  const [handleRegion, setHandleRegion] = useState("");
  const [handleFolderIds, setHandleFolderIds] = useState<number[]>([]);
  const [handlePreview, setHandlePreview] = useState<any>(null);
  const [handleImporting, setHandleImporting] = useState(false);
  const handleFileRef = useRef<HTMLInputElement>(null);

  // ─── Campaign CSV import state ─────────────────────────────────────────────
  const [csvText, setCsvText] = useState("");
  const [previewData, setPreviewData] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const csvFileRef = useRef<HTMLInputElement>(null);

  // ─── Data ──────────────────────────────────────────────────────────────────
  const { data: kols = [], isLoading } = trpc.kol.list.useQuery({
    search: search || undefined,
    region: regionFilter !== "all" ? regionFilter : undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
  });

  const { data: folderList = [] } = trpc.folder.list.useQuery();

  // ─── Mutations ─────────────────────────────────────────────────────────────
  const deleteMutation = trpc.kol.delete.useMutation({
    onSuccess: () => { utils.kol.list.invalidate(); toast.success("KOL deleted"); setDeleteId(null); },
    onError: () => toast.error("Failed to delete KOL"),
  });

  const bulkDeleteMutation = trpc.kol.bulkDelete.useMutation({
    onSuccess: (data) => {
      utils.kol.list.invalidate();
      toast.success(`Deleted ${data.deleted} KOL${data.deleted !== 1 ? "s" : ""}`);
      setSelected(new Set());
      setBulkDeleteOpen(false);
    },
    onError: () => toast.error("Bulk delete failed"),
  });

  const bulkStatusMutation = trpc.kol.bulkUpdateStatus.useMutation({
    onSuccess: (data) => {
      utils.kol.list.invalidate();
      toast.success(`Updated ${data.updated} KOL${data.updated !== 1 ? "s" : ""} to ${bulkStatus}`);
      setSelected(new Set());
      setBulkStatusOpen(false);
    },
    onError: () => toast.error("Status update failed"),
  });

  const bulkFolderMutation = trpc.kol.bulkAddToFolder.useMutation({
    onSuccess: (data) => {
      utils.kol.list.invalidate();
      toast.success(`Added ${data.added} KOL${data.added !== 1 ? "s" : ""} to folder`);
      setSelected(new Set());
      setBulkFolderOpen(false);
    },
    onError: () => toast.error("Folder assignment failed"),
  });

  const bulkEnrichMutation = trpc.kol.enrichBulk.useMutation({
    onSuccess: (data) => {
      utils.kol.list.invalidate();
      console.log('[ENRICH RESULT]', JSON.stringify(data));
      if (!data.success && (data as any).reason === "X_API_KEY_MISSING") {
        toast.error("X API key not configured. Add X_API_BEARER_TOKEN in Secrets.");
      } else if (data.success) {
        toast.success(`Enriched ${data.enriched} KOL${data.enriched !== 1 ? 's' : ''}${data.failed ? `, ${data.failed} failed` : ""}`);
      } else {
        toast.error(`Enrichment error: ${(data as any).message || 'Unknown error'}`);
      }
      setSelected(new Set());
    },
    onError: (err) => {
      console.error('[ENRICH ERROR]', err);
      toast.error(`Enrichment error: ${err.message}`);
    },
  });

  const previewHandlesMutation = trpc.kol.previewHandles.useMutation({
    onSuccess: (data) => setHandlePreview(data),
    onError: () => toast.error("Failed to parse handles"),
  });

  const importHandlesMutation = trpc.kol.importHandles.useMutation({
    onSuccess: (data) => {
      utils.kol.list.invalidate();
      const msg = [`Imported ${data.inserted} KOL${data.inserted !== 1 ? "s" : ""}`];
      if (data.skipped > 0) msg.push(`${data.skipped} already existed (skipped)`);
      toast.success(msg.join(" · "));
      setImportMode(null);
      setHandleText("");
      setHandlePreview(null);
      setHandleRegion("");
      setHandleFolderIds([]);
      setHandleImporting(false);
    },
    onError: () => { toast.error("Import failed"); setHandleImporting(false); },
  });

  const previewCsvMutation = trpc.kol.previewCsv.useMutation({
    onSuccess: (data) => setPreviewData(data),
    onError: () => toast.error("Failed to parse CSV"),
  });

  const importCsvMutation = trpc.kol.importCsv.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        const parts = [`Imported ${data.kolsInserted} new KOLs`];
        if ((data as any).kolsSkipped > 0) parts.push(`${(data as any).kolsSkipped} already existed`);
        parts.push(`${data.postsInserted} posts`);
        toast.success(parts.join(" · "));
        utils.kol.list.invalidate();
        setImportMode(null);
        setCsvText("");
        setPreviewData(null);
      } else {
        toast.error((data.warnings as string[])[0] || "Import failed — unrecognized format");
      }
      setImporting(false);
    },
    onError: () => { toast.error("Import failed"); setImporting(false); },
  });

  // ─── Derived data ──────────────────────────────────────────────────────────
  const regions = useMemo(() => {
    const s = new Set(kols.map(k => k.region).filter((r): r is string => !!r));
    return Array.from(s).sort();
  }, [kols]);

  const categories = useMemo(() => {
    const s = new Set(kols.map(k => k.category).filter((c): c is string => !!c));
    return Array.from(s).sort();
  }, [kols]);

  // Unique values per column for checkbox filters
  const colValues = useMemo(() => ({
    region: Array.from(new Set(kols.map(k => k.region ?? ""))).sort(),
    category: Array.from(new Set(kols.map(k => k.category ?? ""))).sort(),
    status: Array.from(new Set(kols.map(k => k.status ?? ""))).sort(),
    postLanguage: Array.from(new Set(kols.map(k => (k as any).postLanguage ?? ""))).sort(),
  }), [kols]);

  const filtered = useMemo(() => {
    let list = [...kols];
    if (statusFilter !== "all") list = list.filter(k => k.status === statusFilter);
    // Apply column filters
    for (const [key, values] of Object.entries(colFilters)) {
      if (values.size === 0) continue;
      list = list.filter(k => {
        const v = String((k as any)[key] ?? "");
        return values.has(v);
      });
    }
    list.sort((a, b) => {
      let av: any = a[sortField];
      let bv: any = b[sortField];
      if (av == null) av = sortDir === "asc" ? Infinity : -Infinity;
      if (bv == null) bv = sortDir === "asc" ? Infinity : -Infinity;
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [kols, statusFilter, sortField, sortDir]);

  const allSelected = filtered.length > 0 && filtered.every(k => selected.has(k.id));
  const someSelected = filtered.some(k => selected.has(k.id));
  const selectedCount = selected.size;

  // ─── Handlers ──────────────────────────────────────────────────────────────
  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(k => n.delete(k.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(k => n.add(k.id)); return n; });
    }
  }

  function toggleSelect(id: number) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function handleHandleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setHandleText(text);
      setHandlePreview(null);
      previewHandlesMutation.mutate({ rawText: text });
    };
    reader.readAsText(file);
  }

  function handleHandleTextChange(text: string) {
    setHandleText(text);
    setHandlePreview(null);
    if (text.trim()) previewHandlesMutation.mutate({ rawText: text });
  }

  function handleHandleImport() {
    if (!handlePreview?.handles?.length) return;
    setHandleImporting(true);
    importHandlesMutation.mutate({
      handles: handlePreview.handles,
      region: handleRegion || undefined,
      folderIds: handleFolderIds.length > 0 ? handleFolderIds : undefined,
    });
  }

  function handleCsvFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      setPreviewData(null);
      previewCsvMutation.mutate({ csvText: text });
    };
    reader.readAsText(file);
  }

  function handleCsvImport() {
    if (!csvText) return;
    setImporting(true);
    importCsvMutation.mutate({ csvText, sourceLabel: "csv_upload" });
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 text-primary" /> : <ChevronDown className="h-3 w-3 text-primary" />;
  }

  const [bulkFolderTarget, setBulkFolderTarget] = useState<number | null>(null);

  // ─── Single KOL Edit state ──────────────────────────────────────────────────
  const [singleEditKol, setSingleEditKol] = useState<null | { id: number; handle: string; displayName: string; profileUrl: string; followers: number | null }>(null);
  const [singleEditHandle, setSingleEditHandle] = useState("");
  const [singleEditName, setSingleEditName] = useState("");
  const [singleEditUrl, setSingleEditUrl] = useState("");
  const [singleEditFollowers, setSingleEditFollowers] = useState("");

  const singleEditMutation = trpc.kol.update.useMutation({
    onSuccess: () => {
      utils.kol.list.invalidate();
      toast.success("KOL updated");
      setSingleEditKol(null);
    },
    onError: () => toast.error("Failed to update KOL"),
  });

  function openSingleEdit(kol: any) {
    setSingleEditKol({ id: kol.id, handle: kol.handle, displayName: kol.displayName ?? "", profileUrl: kol.profileUrl ?? "", followers: kol.followers ?? null });
    setSingleEditHandle(kol.handle ?? "");
    setSingleEditName(kol.displayName ?? "");
    setSingleEditUrl(kol.profileUrl ?? "");
    setSingleEditFollowers(kol.followers != null ? String(kol.followers) : "");
  }

  function handleSingleEditSave() {
    if (!singleEditKol) return;
    const data: any = {};
    if (singleEditHandle.trim()) data.handle = singleEditHandle.trim().replace(/^@/, "");
    if (singleEditName.trim()) data.displayName = singleEditName.trim();
    if (singleEditUrl.trim()) data.profileUrl = singleEditUrl.trim();
    const parsedFollowers = singleEditFollowers.trim() ? parseInt(singleEditFollowers.trim(), 10) : undefined;
    if (parsedFollowers !== undefined && !isNaN(parsedFollowers)) data.followers = parsedFollowers;
    singleEditMutation.mutate({ id: singleEditKol.id, data });
  }

  // ─── Bulk Edit state ───────────────────────────────────────────────────────
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditRegion, setBulkEditRegion] = useState("");
  const [bulkEditLanguage, setBulkEditLanguage] = useState("");
  const [bulkEditCategory, setBulkEditCategory] = useState("");
  const [bulkEditFolderId, setBulkEditFolderId] = useState<number | null>(null);

  const bulkEditMutation = trpc.kol.bulkEdit.useMutation({
    onSuccess: (data) => {
      utils.kol.list.invalidate();
      toast.success(`Updated ${data.updated} KOL${data.updated !== 1 ? "s" : ""}`);
      setSelected(new Set());
      setBulkEditOpen(false);
      setBulkEditRegion(""); setBulkEditLanguage(""); setBulkEditCategory(""); setBulkEditFolderId(null);
    },
    onError: () => toast.error("Bulk edit failed"),
  });

  function handleBulkEdit() {
    const payload: any = { ids: Array.from(selected) };
    if (bulkEditRegion.trim()) payload.region = bulkEditRegion.trim();
    if (bulkEditLanguage.trim()) payload.postLanguage = bulkEditLanguage.trim();
    if (bulkEditCategory.trim()) payload.category = bulkEditCategory.trim();
    if (bulkEditFolderId !== null) payload.folderId = bulkEditFolderId;
    bulkEditMutation.mutate(payload);
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 p-2">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">KOL Database</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {filtered.length} KOL{filtered.length !== 1 ? "s" : ""}
              {kols.length !== filtered.length ? ` of ${kols.length}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setImportMode("handles")}
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            >
              <UserPlus className="h-4 w-4" />
              Add KOLs
            </Button>
            <Button
              variant="outline"
              onClick={() => setImportMode("csv")}
              className="border-border text-foreground hover:bg-secondary gap-2"
            >
              <Upload className="h-4 w-4" />
              Import Campaign CSV
            </Button>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/20 flex-wrap">
            <span className="text-sm font-medium text-primary">{selectedCount} selected</span>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => setBulkEditOpen(true)}
                className="border-primary/40 text-primary hover:bg-primary/10 h-7 text-xs gap-1">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulkStatusOpen(true)}
                className="border-border text-foreground hover:bg-secondary h-7 text-xs gap-1">
                <CheckSquare className="h-3.5 w-3.5" />
                Set Status
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulkFolderOpen(true)}
                className="border-border text-foreground hover:bg-secondary h-7 text-xs gap-1">
                <FolderPlus className="h-3.5 w-3.5" />
                Add to Folder
              </Button>
              <Button size="sm" variant="outline"
                onClick={() => bulkEnrichMutation.mutate({ ids: Array.from(selected) })}
                disabled={bulkEnrichMutation.isPending}
                className="border-border text-foreground hover:bg-secondary h-7 text-xs gap-1">
                <Zap className="h-3.5 w-3.5" />
                {bulkEnrichMutation.isPending ? "Enriching..." : "Enrich (X API)"}
              </Button>
              <Button size="sm" variant="outline"
                onClick={() => {
                  const sel = filtered.filter(k => selected.has(k.id));
                  const rows = sel.length > 0 ? sel : filtered;
                  const headers = ["Handle", "Display Name", "Region", "Language", "Category", "Followers", "Avg Likes", "Avg RT", "Avg Replies", "Avg Views", "Total Posts", "Cost Per Post", "Status"];
                  const csvRows = rows.map(k => [
                    k.handle, k.displayName ?? "", k.region ?? "", (k as any).postLanguage ?? "",
                    k.category ?? "", k.followers ?? "", k.avgLikes ?? "", k.avgRetweets ?? "",
                    k.avgReplies ?? "", (k as any).avgViews ?? "",
                    (k as any).totalCampaignPosts ?? "",
                    k.costPerPost ?? "", k.status ?? "",
                  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
                  const csv = [headers.join(","), ...csvRows].join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = "kol_database.csv"; a.click();
                  URL.revokeObjectURL(url);
                }}
                className="border-border text-foreground hover:bg-secondary h-7 text-xs gap-1">
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulkDeleteOpen(true)}
                className="border-destructive/40 text-destructive hover:bg-destructive/10 h-7 text-xs gap-1">
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
            <button onClick={() => setSelected(new Set())}
              className="ml-auto text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search handle or name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="w-[140px] bg-secondary border-border text-foreground">
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">All Regions</SelectItem>
              {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px] bg-secondary border-border text-foreground">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] bg-secondary border-border text-foreground">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-4 py-3 text-left"><ColumnHeader label="KOL" sortKey="displayName" sortDir={sortField==="displayName"?sortDir:null} onSort={handleColSort} /></th>
                  <th className="px-4 py-3 text-left"><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Platform</span></th>
                  <th className="px-4 py-3 text-left"><ColumnHeader label="Region" sortKey="region" sortDir={sortField==="region"?sortDir:null} onSort={handleColSort} filterValues={colValues.region} selectedValues={colFilters.region??new Set()} onFilterChange={(v)=>setColFilter("region",v)} /></th>
                  <th className="px-4 py-3 text-left"><ColumnHeader label="Language" sortKey="postLanguage" sortDir={sortField==="postLanguage"?sortDir:null} onSort={handleColSort} filterValues={colValues.postLanguage} selectedValues={colFilters.postLanguage??new Set()} onFilterChange={(v)=>setColFilter("postLanguage",v)} /></th>
                  <th className="px-4 py-3 text-left"><ColumnHeader label="Category" sortKey="category" sortDir={sortField==="category"?sortDir:null} onSort={handleColSort} filterValues={colValues.category} selectedValues={colFilters.category??new Set()} onFilterChange={(v)=>setColFilter("category",v)} /></th>
                  <th className="px-4 py-3 text-left"><ColumnHeader label="Followers" sortKey="followers" sortDir={sortField==="followers"?sortDir:null} onSort={handleColSort} /></th>
                  <th className="px-4 py-3 text-left"><ColumnHeader label="Eng. Rate" sortKey="engagementRate" sortDir={sortField==="engagementRate"?sortDir:null} onSort={handleColSort} /></th>
                  <th className="px-4 py-3 text-left"><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Posts</span></th>
                  <th className="px-4 py-3 text-left"><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg Views</span></th>
                  <th className="px-4 py-3 text-left"><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">CPM</span></th>
                  <th className="px-4 py-3 text-left"><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">CPP</span></th>
                  <th className="px-4 py-3 text-left"><ColumnHeader label="Status" sortKey="status" sortDir={sortField==="status"?sortDir:null} onSort={handleColSort} filterValues={colValues.status} selectedValues={colFilters.status??new Set()} onFilterChange={(v)=>setColFilter("status",v)} /></th>
                  <th className="px-4 py-3 text-left"><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Enriched</span></th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-secondary animate-pulse rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-4 py-12 text-center text-muted-foreground">
                      {kols.length === 0
                        ? 'No KOLs yet. Click "Add KOLs" to import X handles.'
                        : "No KOLs match the current filters."}
                    </td>
                  </tr>
                ) : (
                  filtered.map(kol => (
                    <tr
                      key={kol.id}
                      className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${selected.has(kol.id) ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(kol.id)}
                          onCheckedChange={() => toggleSelect(kol.id)}
                          className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => setLocation(`/kols/${kol.id}`)}>
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                            {(kol.displayName || kol.handle).charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate max-w-[140px]">
                              {kol.displayName || kol.handle}
                            </p>
                            <p className="text-xs text-muted-foreground">@{kol.handle}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground cursor-pointer" onClick={() => setLocation(`/kols/${kol.id}`)}>{kol.platform}</td>
                      <td className="px-4 py-3 text-muted-foreground cursor-pointer" onClick={() => setLocation(`/kols/${kol.id}`)}>{kol.region || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground cursor-pointer text-xs" onClick={() => setLocation(`/kols/${kol.id}`)}>{(kol as any).postLanguage || "—"}</td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => setLocation(`/kols/${kol.id}`)}>
                        {kol.category ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border">
                            {kol.category}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-foreground font-mono text-xs cursor-pointer" onClick={() => setLocation(`/kols/${kol.id}`)}>
                        {formatNum(kol.followers)}
                      </td>
                      <td className="px-4 py-3 text-foreground font-mono text-xs cursor-pointer" onClick={() => setLocation(`/kols/${kol.id}`)}>
                        {kol.engagementRate != null ? `${Number(kol.engagementRate).toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-foreground font-mono text-xs cursor-pointer" onClick={() => setLocation(`/kols/${kol.id}`)}>{
                        (() => { const t = (kol as any).totalCampaignPosts ?? 0; const k = (kol as any).totalKolPosts ?? 0; const total = t + k; return total > 0 ? formatNum(total) : "—"; })()
                      }</td>
                      <td className="px-4 py-3 text-foreground font-mono text-xs cursor-pointer" onClick={() => setLocation(`/kols/${kol.id}`)}>{
                        (kol as any).avgViews != null ? formatNum((kol as any).avgViews) : "—"
                      }</td>
                      <td className="px-4 py-3 text-foreground font-mono text-xs cursor-pointer" onClick={() => setLocation(`/kols/${kol.id}`)}>{
                        (() => { const views = (kol as any).avgViews; const cost = kol.costPerPost; if (!views || !cost) return "—"; return `$${((Number(cost) / views) * 1000).toFixed(2)}`; })()
                      }</td>
                      <td className="px-4 py-3 text-foreground font-mono text-xs cursor-pointer" onClick={() => setLocation(`/kols/${kol.id}`)}>{
                        kol.costPerPost != null ? `$${Number(kol.costPerPost).toFixed(2)}` : "—"
                      }</td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => setLocation(`/kols/${kol.id}`)}>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColors[kol.status] || statusColors.pending}`}>
                          {kol.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => setLocation(`/kols/${kol.id}`)}>
                        <span className={`text-xs font-medium ${enrichColors[(kol as any).enrichmentStatus] || enrichColors.never}`}>
                          {(kol as any).enrichmentStatus === "done" ? "✓" :
                           (kol as any).enrichmentStatus === "pending" ? "…" :
                           (kol as any).enrichmentStatus === "failed" ? "✗" : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setLocation(`/kols/${kol.id}`)}
                            className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                            title="View"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => openSingleEdit(kol)}
                            className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteId(kol.id)}
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Add KOLs Modal (handle / URL import) ─────────────────────────────── */}
      <Dialog open={importMode === "handles"} onOpenChange={open => !open && setImportMode(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg">
          <DialogHeader>
            <DialogTitle>Add KOLs</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste X handles or profile URLs — one per line, or upload a CSV.
              Accepts: <code className="text-primary text-xs">@handle</code>, <code className="text-primary text-xs">handle</code>, or <code className="text-primary text-xs">https://x.com/handle</code>.
              Duplicates are automatically skipped.
            </p>

            <textarea
              className="w-full h-32 bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={"@elonmusk\nhttps://x.com/VitalikButerin\ncz_binance"}
              value={handleText}
              onChange={e => handleHandleTextChange(e.target.value)}
            />

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleFileRef.current?.click()}
                className="text-xs text-primary hover:underline"
              >
                Or upload a CSV file
              </button>
              <input ref={handleFileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleHandleFileUpload} />
            </div>

            {/* Optional: region + folder assignment */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Region (optional)</label>
                <Input
                  placeholder="e.g. India, Korea..."
                  value={handleRegion}
                  onChange={e => setHandleRegion(e.target.value)}
                  className="bg-secondary border-border text-foreground text-sm h-8"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Add to Folder (optional)</label>
                <Select
                  value={handleFolderIds[0]?.toString() ?? "none"}
                  onValueChange={v => setHandleFolderIds(v === "none" ? [] : [parseInt(v)])}
                >
                  <SelectTrigger className="bg-secondary border-border text-foreground h-8 text-sm">
                    <SelectValue placeholder="No folder" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="none">No folder</SelectItem>
                    {folderList.map(f => (
                      <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Preview */}
            {previewHandlesMutation.isPending && (
              <p className="text-xs text-muted-foreground animate-pulse">Parsing...</p>
            )}
            {handlePreview && (
              <div className="rounded-lg bg-secondary/50 border border-border p-3 space-y-2">
                <div className="flex gap-4 text-xs">
                  <span className="text-primary font-medium">{handlePreview.valid} valid</span>
                  {handlePreview.invalid > 0 && <span className="text-destructive">{handlePreview.invalid} invalid/duplicate</span>}
                </div>
                {handlePreview.preview?.length > 0 && (
                  <div className="space-y-0.5 max-h-32 overflow-y-auto">
                    {handlePreview.preview.map((p: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={p.valid ? "text-primary" : "text-muted-foreground line-through"}>
                          {p.handle ?? p.raw}
                        </span>
                        {!p.valid && <span className="text-destructive text-[10px]">invalid</span>}
                      </div>
                    ))}
                    {handlePreview.total > 20 && (
                      <p className="text-xs text-muted-foreground">…and {handlePreview.total - 20} more</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportMode(null); setHandleText(""); setHandlePreview(null); }}
              className="border-border text-foreground hover:bg-secondary">
              Cancel
            </Button>
            <Button
              onClick={handleHandleImport}
              disabled={!handlePreview?.valid || handleImporting}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {handleImporting ? "Adding..." : `Add ${handlePreview?.valid ?? 0} KOLs`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Campaign CSV Import Modal ─────────────────────────────────────────── */}
      <Dialog open={importMode === "csv"} onOpenChange={open => !open && setImportMode(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Campaign CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Supports Cookie3 aggregate exports (Nova/Turkish) and campaign post-tracker formats (India/Korea).
              Format is auto-detected. Existing KOLs are not duplicated — new posts are appended to their record.
            </p>
            <div
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => csvFileRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Click to select a CSV file</p>
              <input ref={csvFileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFileUpload} />
            </div>
            {previewCsvMutation.isPending && (
              <p className="text-xs text-muted-foreground text-center animate-pulse">Analyzing format...</p>
            )}
            {previewData && (
              <div className="rounded-lg bg-secondary/50 border border-border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${previewData.format === "UNKNOWN" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}>
                    {previewData.format}
                  </span>
                </div>
                {previewData.format !== "UNKNOWN" ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">KOLs:</span><span className="ml-2 text-foreground font-medium">{previewData.kolCount}</span></div>
                      <div><span className="text-muted-foreground">Posts:</span><span className="ml-2 text-foreground font-medium">{previewData.postCount}</span></div>
                    </div>
                    {previewData.sample?.length > 0 && (
                      <div className="space-y-1 mt-2">
                        <p className="text-xs text-muted-foreground">Sample:</p>
                        {previewData.sample.map((k: any, i: number) => (
                          <div key={i} className="text-xs text-foreground flex gap-2">
                            <span className="text-primary">@{k.handle}</span>
                            {k.displayName && k.displayName !== k.handle && <span className="text-muted-foreground">{k.displayName}</span>}
                            {k.followers && <span className="text-muted-foreground">{formatNum(k.followers)} followers</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-destructive">{previewData.warnings?.[0]}</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportMode(null); setCsvText(""); setPreviewData(null); }}
              className="border-border text-foreground hover:bg-secondary">
              Cancel
            </Button>
            <Button
              onClick={handleCsvImport}
              disabled={!csvText || !previewData || previewData.format === "UNKNOWN" || importing}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {importing ? "Importing..." : `Import ${previewData?.kolCount ?? ""} KOLs`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk: Set Status ─────────────────────────────────────────────────── */}
      <Dialog open={bulkStatusOpen} onOpenChange={setBulkStatusOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader><DialogTitle>Set Status for {selectedCount} KOLs</DialogTitle></DialogHeader>
          <Select value={bulkStatus} onValueChange={v => setBulkStatus(v as any)}>
            <SelectTrigger className="bg-secondary border-border text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkStatusOpen(false)} className="border-border text-foreground hover:bg-secondary">Cancel</Button>
            <Button onClick={() => bulkStatusMutation.mutate({ ids: Array.from(selected), status: bulkStatus })}
              className="bg-primary text-primary-foreground hover:bg-primary/90">
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk: Add to Folder ──────────────────────────────────────────────── */}
      <Dialog open={bulkFolderOpen} onOpenChange={setBulkFolderOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader><DialogTitle>Add {selectedCount} KOLs to Folder</DialogTitle></DialogHeader>
          <Select value={bulkFolderTarget?.toString() ?? "none"} onValueChange={v => setBulkFolderTarget(v === "none" ? null : parseInt(v))}>
            <SelectTrigger className="bg-secondary border-border text-foreground">
              <SelectValue placeholder="Select a folder" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="none">Select a folder...</SelectItem>
              {folderList.map(f => <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {folderList.length === 0 && (
            <p className="text-xs text-muted-foreground">No folders yet. Create one on the Folders page first.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkFolderOpen(false)} className="border-border text-foreground hover:bg-secondary">Cancel</Button>
            <Button
              disabled={!bulkFolderTarget}
              onClick={() => bulkFolderTarget && bulkFolderMutation.mutate({ ids: Array.from(selected), folderId: bulkFolderTarget })}
              className="bg-primary text-primary-foreground hover:bg-primary/90">
              Add to Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Single ────────────────────────────────────────────────────── */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete KOL?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete the KOL and all associated post records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground hover:bg-secondary">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk Edit ───────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {selectedCount} KOL{selectedCount !== 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">Only filled fields will be updated. Leave blank to keep existing values.</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Region</label>
              <Input
                placeholder="e.g. Korea, India, Turkey..."
                value={bulkEditRegion}
                onChange={e => setBulkEditRegion(e.target.value)}
                className="bg-secondary border-border text-foreground text-sm h-8"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Post Language</label>
              <Input
                placeholder="e.g. Korean, English, Turkish..."
                value={bulkEditLanguage}
                onChange={e => setBulkEditLanguage(e.target.value)}
                className="bg-secondary border-border text-foreground text-sm h-8"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Category</label>
              <Input
                placeholder="e.g. Crypto, Gaming, DeFi..."
                value={bulkEditCategory}
                onChange={e => setBulkEditCategory(e.target.value)}
                className="bg-secondary border-border text-foreground text-sm h-8"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Add to Folder (optional)</label>
              <Select value={bulkEditFolderId?.toString() ?? "none"} onValueChange={v => setBulkEditFolderId(v === "none" ? null : parseInt(v))}>
                <SelectTrigger className="bg-secondary border-border text-foreground h-8 text-sm">
                  <SelectValue placeholder="No folder change" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="none">No folder change</SelectItem>
                  {folderList.map(f => <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkEditOpen(false)} className="border-border text-foreground hover:bg-secondary">Cancel</Button>
            <Button
              onClick={handleBulkEdit}
              disabled={bulkEditMutation.isPending || (!bulkEditRegion.trim() && !bulkEditLanguage.trim() && !bulkEditCategory.trim() && bulkEditFolderId === null)}
              className="bg-primary text-primary-foreground hover:bg-primary/90">
              {bulkEditMutation.isPending ? "Saving..." : `Update ${selectedCount} KOL${selectedCount !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Single KOL Edit ────────────────────────────────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={!!singleEditKol} onOpenChange={open => !open && setSingleEditKol(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle>Edit @{singleEditKol?.handle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Twitter Handle</label>
              <Input
                placeholder="e.g. elonmusk (without @)"
                value={singleEditHandle}
                onChange={e => setSingleEditHandle(e.target.value.replace(/^@/, ""))}
                className="bg-secondary border-border text-foreground text-sm h-8"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Display Name</label>
              <Input
                placeholder="e.g. Elon Musk"
                value={singleEditName}
                onChange={e => setSingleEditName(e.target.value)}
                className="bg-secondary border-border text-foreground text-sm h-8"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Profile URL</label>
              <Input
                placeholder="https://x.com/handle"
                value={singleEditUrl}
                onChange={e => setSingleEditUrl(e.target.value)}
                className="bg-secondary border-border text-foreground text-sm h-8"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Followers</label>
              <Input
                placeholder="e.g. 12500"
                type="number"
                value={singleEditFollowers}
                onChange={e => setSingleEditFollowers(e.target.value)}
                className="bg-secondary border-border text-foreground text-sm h-8"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSingleEditKol(null)} className="border-border text-foreground hover:bg-secondary">Cancel</Button>
            <Button
              onClick={handleSingleEditSave}
              disabled={singleEditMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90">
              {singleEditMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Delete ────────────────────────────────────────────────────────────────────────────────────────────────────── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} KOLs?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete all selected KOLs and their post records. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground hover:bg-secondary">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate({ ids: Array.from(selected) })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete {selectedCount} KOLs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
