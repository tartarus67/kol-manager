import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { trpc } from "@/lib/trpc";
import {
  Search, Upload, Trash2, Eye, Edit2, ChevronUp, ChevronDown, X,
} from "lucide-react";
import { useState, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type SortField = "displayName" | "followers" | "engagementRate" | "region" | "category" | "status";
type SortDir = "asc" | "desc";

export default function KolList() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // Filters
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Sort
  const [sortField, setSortField] = useState<SortField>("displayName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Import modal
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [previewData, setPreviewData] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Delete
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: kols = [], isLoading } = trpc.kol.list.useQuery({
    search: search || undefined,
    region: regionFilter !== "all" ? regionFilter : undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
  });

  const deleteMutation = trpc.kol.delete.useMutation({
    onSuccess: () => {
      utils.kol.list.invalidate();
      toast.success("KOL deleted");
      setDeleteId(null);
    },
    onError: () => toast.error("Failed to delete KOL"),
  });

  const previewMutation = trpc.kol.previewCsv.useMutation({
    onSuccess: (data) => setPreviewData(data),
    onError: () => toast.error("Failed to parse CSV"),
  });

  const importMutation = trpc.kol.importCsv.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Imported ${data.kolsInserted} KOLs, ${data.postsInserted} posts (${data.format})`);
        utils.kol.list.invalidate();
        setImportOpen(false);
        setCsvText("");
        setPreviewData(null);
      } else {
        toast.error(data.warnings[0] || "Import failed — unrecognized format");
      }
      setImporting(false);
    },
    onError: () => { toast.error("Import failed"); setImporting(false); },
  });

  // Unique filter options
  const regions = useMemo(() => {
    const s = new Set(kols.map(k => k.region).filter((r): r is string => !!r));
    return Array.from(s).sort();
  }, [kols]);

  const categories = useMemo(() => {
    const s = new Set(kols.map(k => k.category).filter((c): c is string => !!c));
    return Array.from(s).sort();
  }, [kols]);

  // Client-side sort + status filter
  const filtered = useMemo(() => {
    let list = [...kols];
    if (statusFilter !== "all") list = list.filter(k => k.status === statusFilter);
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

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      setPreviewData(null);
      previewMutation.mutate({ csvText: text });
    };
    reader.readAsText(file);
  }

  function handleImport() {
    if (!csvText) return;
    setImporting(true);
    importMutation.mutate({ csvText, sourceLabel: "csv_upload" });
  }

  function formatNum(n: number | null | undefined) {
    if (n == null) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp className="h-3 w-3 opacity-30" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 text-primary" />
      : <ChevronDown className="h-3 w-3 text-primary" />;
  }

  const statusColors: Record<string, string> = {
    active: "bg-primary/15 text-primary border-primary/20",
    inactive: "bg-destructive/15 text-destructive border-destructive/20",
    pending: "bg-muted text-muted-foreground border-border",
  };

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
          <Button
            onClick={() => setImportOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
        </div>

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
                  {[
                    { label: "KOL", field: "displayName" as SortField },
                    { label: "Platform", field: null },
                    { label: "Region", field: "region" as SortField },
                    { label: "Category", field: "category" as SortField },
                    { label: "Followers", field: "followers" as SortField },
                    { label: "Eng. Rate", field: "engagementRate" as SortField },
                    { label: "Status", field: "status" as SortField },
                    { label: "", field: null },
                  ].map(({ label, field }) => (
                    <th
                      key={label}
                      className={`px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider ${field ? "cursor-pointer hover:text-foreground select-none" : ""}`}
                      onClick={field ? () => handleSort(field) : undefined}
                    >
                      <div className="flex items-center gap-1">
                        {label}
                        {field && <SortIcon field={field} />}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-secondary rounded animate-pulse w-20" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      {kols.length === 0
                        ? "No KOLs yet. Use Import CSV to add your first KOLs."
                        : "No KOLs match the current filters."}
                    </td>
                  </tr>
                ) : (
                  filtered.map(kol => (
                    <tr
                      key={kol.id}
                      className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer"
                      onClick={() => setLocation(`/kols/${kol.id}`)}
                    >
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3 text-muted-foreground">{kol.platform}</td>
                      <td className="px-4 py-3 text-muted-foreground">{kol.region || "—"}</td>
                      <td className="px-4 py-3">
                        {kol.category ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border">
                            {kol.category}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-foreground font-mono text-xs">
                        {formatNum(kol.followers)}
                      </td>
                      <td className="px-4 py-3 text-foreground font-mono text-xs">
                        {kol.engagementRate != null ? `${Number(kol.engagementRate).toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColors[kol.status] || statusColors.pending}`}>
                          {kol.status}
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

      {/* Import CSV Modal */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Import KOLs from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Supports: Cookie3 aggregate exports (Nova/Turkish) and campaign post-tracker formats (India/Korea).
              Format is auto-detected.
            </p>
            <div
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Click to select a CSV file
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            {previewMutation.isPending && (
              <p className="text-xs text-muted-foreground text-center animate-pulse">Analyzing format...</p>
            )}

            {previewData && (
              <div className="rounded-lg bg-secondary/50 border border-border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    previewData.format === "UNKNOWN"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-primary/15 text-primary"
                  }`}>
                    {previewData.format}
                  </span>
                </div>
                {previewData.format !== "UNKNOWN" ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">KOLs to import:</span>
                        <span className="ml-2 text-foreground font-medium">{previewData.kolCount}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Posts to import:</span>
                        <span className="ml-2 text-foreground font-medium">{previewData.postCount}</span>
                      </div>
                    </div>
                    {previewData.sample?.length > 0 && (
                      <div className="space-y-1 mt-2">
                        <p className="text-xs text-muted-foreground">Sample KOLs:</p>
                        {previewData.sample.map((k: any, i: number) => (
                          <div key={i} className="text-xs text-foreground flex gap-2">
                            <span className="text-primary">@{k.handle}</span>
                            {k.displayName && k.displayName !== k.handle && (
                              <span className="text-muted-foreground">{k.displayName}</span>
                            )}
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
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setImportOpen(false); setCsvText(""); setPreviewData(null); }}
              className="border-border text-foreground hover:bg-secondary">
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!csvText || !previewData || previewData.format === "UNKNOWN" || importing}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {importing ? "Importing..." : `Import ${previewData?.kolCount ?? ""} KOLs`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
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
