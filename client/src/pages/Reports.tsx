import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search, Plus, X, Save, Download, Trash2, FileText,
  ChevronRight, Calendar, Users, Globe, Folder, AlertCircle,
  ExternalLink, ArrowLeft
} from "lucide-react";

type SearchResult = {
  tweetId?: string;
  authorHandle?: string;
  authorName?: string;
  kolId?: number | null;
  content?: string;
  postedAt?: Date | null;
  language?: string;
  url?: string;
  likes?: number;
  retweets?: number;
  replies?: number;
  quotes?: number;
  impressions?: number | null;
};

type SavedReport = {
  id: number;
  name: string;
  keywords: string;
  keywordMode: string | null;
  startDate: string | null;
  endDate: string | null;
  resultCount: number | null;
  createdAt: Date;
};

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ko", label: "Korean" },
  { code: "tr", label: "Turkish" },
  { code: "hi", label: "Hindi" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "id", label: "Indonesian" },
  { code: "vi", label: "Vietnamese" },
  { code: "th", label: "Thai" },
];

export default function Reports() {
  const [view, setView] = useState<"list" | "search" | "detail">("list");
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  // Search form state
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywordMode, setKeywordMode] = useState<"AND" | "OR">("OR");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedKolIds, setSelectedKolIds] = useState<number[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<number[]>([]);
  const [maxResults, setMaxResults] = useState(50);
  const [regionInput, setRegionInput] = useState("");

  // Results state
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  // Save modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [reportName, setReportName] = useState("");

  // KOL selector state
  const [kolSearch, setKolSearch] = useState("");
  const [showKolDropdown, setShowKolDropdown] = useState(false);

  // Data queries
  const { data: kolsData, isLoading: kolsLoading } = trpc.kol.list.useQuery({});
  const { data: foldersData } = trpc.folder.list.useQuery();
  const { data: reportsData, refetch: refetchReports } = trpc.report.list.useQuery();
  const { data: reportDetail } = trpc.report.getById.useQuery(
    { id: selectedReportId! },
    { enabled: !!selectedReportId && view === "detail" }
  );

  const searchMutation = trpc.report.search.useMutation({
    onSuccess: (data) => {
      if (!data.success) {
        toast.error(data.message ?? "Search failed");
        return;
      }
      setSearchResults(data.results as SearchResult[]);
      setSearchQuery((data as any).query ?? "");
      setHasSearched(true);
      toast.success(`Found ${data.results.length} tweets`);
    },
    onError: (err) => toast.error(err.message),
  });

  const saveMutation = trpc.report.save.useMutation({
    onSuccess: (data) => {
      toast.success("Report saved");
      setShowSaveModal(false);
      setReportName("");
      refetchReports();
      setSelectedReportId(data.reportId);
      setView("detail");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.report.delete.useMutation({
    onSuccess: () => {
      toast.success("Report deleted");
      refetchReports();
      if (view === "detail") setView("list");
    },
    onError: (err) => toast.error(err.message),
  });

  const exportQuery = trpc.report.exportCsv.useQuery(
    { id: selectedReportId! },
    { enabled: false }
  );

  const kols = kolsData ?? [];
  const folders = foldersData ?? [];
  const reports = reportsData ?? [];

  const filteredKols = useMemo(() => {
    if (!kolSearch) return kols.slice(0, 20);
    return kols.filter(k =>
      k.handle.toLowerCase().includes(kolSearch.toLowerCase()) ||
      (k.displayName ?? "").toLowerCase().includes(kolSearch.toLowerCase())
    ).slice(0, 20);
  }, [kols, kolSearch]);

  const uniqueRegions = useMemo(() => {
    const regions = new Set(kols.map(k => k.region).filter(Boolean) as string[]);
    return Array.from(regions).sort();
  }, [kols]);

  function addKeyword() {
    const kw = keywordInput.trim();
    if (!kw || keywords.includes(kw)) return;
    setKeywords(prev => [...prev, kw]);
    setKeywordInput("");
  }

  function removeKeyword(kw: string) {
    setKeywords(prev => prev.filter(k => k !== kw));
  }

  function toggleKol(id: number) {
    setSelectedKolIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleLanguage(code: string) {
    setSelectedLanguages(prev => prev.includes(code) ? prev.filter(x => x !== code) : [...prev, code]);
  }

  function toggleRegion(region: string) {
    setSelectedRegions(prev => prev.includes(region) ? prev.filter(x => x !== region) : [...prev, region]);
  }

  function toggleFolder(id: number) {
    setSelectedFolderIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function addRegion() {
    const r = regionInput.trim();
    if (!r || selectedRegions.includes(r)) return;
    setSelectedRegions(prev => [...prev, r]);
    setRegionInput("");
  }

  function handleSearch() {
    if (keywords.length === 0) { toast.error("Add at least one keyword"); return; }
    searchMutation.mutate({
      keywords,
      keywordMode,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      kolIds: selectedKolIds.length > 0 ? selectedKolIds : undefined,
      languages: selectedLanguages.length > 0 ? selectedLanguages : undefined,
      regions: selectedRegions.length > 0 ? selectedRegions : undefined,
      folderIds: selectedFolderIds.length > 0 ? selectedFolderIds : undefined,
      maxResults,
    });
  }

  function handleSave() {
    if (!reportName.trim()) { toast.error("Enter a report name"); return; }
    saveMutation.mutate({
      name: reportName.trim(),
      keywords,
      keywordMode,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      kolIds: selectedKolIds.length > 0 ? selectedKolIds : undefined,
      languages: selectedLanguages.length > 0 ? selectedLanguages : undefined,
      regions: selectedRegions.length > 0 ? selectedRegions : undefined,
      folderIds: selectedFolderIds.length > 0 ? selectedFolderIds : undefined,
      results: searchResults,
    });
  }

  async function handleExport(reportId: number) {
    try {
      const result = await exportQuery.refetch();
      if (result.data) {
        const blob = new Blob([result.data.csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.data.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      toast.error("Export failed");
    }
  }

  function resetSearch() {
    setKeywords([]);
    setKeywordInput("");
    setKeywordMode("OR");
    setStartDate("");
    setEndDate("");
    setSelectedKolIds([]);
    setSelectedLanguages([]);
    setSelectedRegions([]);
    setSelectedFolderIds([]);
    setSearchResults([]);
    setHasSearched(false);
    setSearchQuery("");
  }

  function formatDate(d: Date | string | null | undefined) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString();
  }

  function formatNum(n: number | null | undefined) {
    if (n == null) return "—";
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  }

  // ── Saved Reports List ─────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <DashboardLayout>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Reports</h1>
              <p className="text-sm text-muted-foreground mt-1">Search X posts by keyword, date, and KOL filters. Save and export results.</p>
            </div>
            <Button
              onClick={() => { resetSearch(); setView("search"); }}
              className="bg-[#D8FE51] text-black hover:bg-[#c8ee41] font-semibold"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Search
            </Button>
          </div>

          {reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <FileText className="w-12 h-12 text-muted-foreground mb-4 opacity-40" />
              <p className="text-muted-foreground text-sm">No saved reports yet. Run a search and save it.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report: SavedReport) => {
                const kws = (() => { try { return JSON.parse(report.keywords) as string[]; } catch { return [report.keywords]; } })();
                return (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:border-[#D8FE51]/40 cursor-pointer transition-colors"
                    onClick={() => { setSelectedReportId(report.id); setView("detail"); }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-[#D8FE51] shrink-0" />
                        <span className="font-medium text-foreground truncate">{report.name}</span>
                        <Badge variant="outline" className="text-xs shrink-0">{report.keywordMode ?? "OR"}</Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1 ml-7">
                        <span className="text-xs text-muted-foreground">
                          {kws.slice(0, 3).map((k: string) => `"${k}"`).join(", ")}{kws.length > 3 ? ` +${kws.length - 3}` : ""}
                        </span>
                        {(report.startDate || report.endDate) && (
                          <span className="text-xs text-muted-foreground">
                            {report.startDate ?? "?"} → {report.endDate ?? "?"}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">{report.resultCount ?? 0} results</span>
                        <span className="text-xs text-muted-foreground">{formatDate(report.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4" onClick={e => e.stopPropagation()}>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => { setSelectedReportId(report.id); handleExport(report.id); }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => { if (confirm("Delete this report?")) deleteMutation.mutate({ id: report.id }); }}
                        className="text-muted-foreground hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ── Report Detail View ─────────────────────────────────────────────────────
  if (view === "detail" && reportDetail) {
    const { report, results } = reportDetail;
    if (!report) return null;
    const kws = (() => { try { return JSON.parse(report.keywords) as string[]; } catch { return [report.keywords]; } })();

    return (
      <DashboardLayout>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setView("list")} className="text-muted-foreground">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <div>
                <h1 className="text-xl font-bold text-foreground">{report.name}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {kws.map((k: string) => `"${k}"`).join(` ${report.keywordMode ?? "OR"} `)}
                  {report.startDate && ` · ${report.startDate} → ${report.endDate ?? "now"}`}
                  {` · ${results.length} results`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => { setSelectedReportId(report.id); handleExport(report.id); }}
                className="border-border"
              >
                <Download className="w-4 h-4 mr-2" /> Export CSV
              </Button>
              <Button
                variant="ghost" size="sm"
                onClick={() => { if (confirm("Delete this report?")) deleteMutation.mutate({ id: report.id }); }}
                className="text-muted-foreground hover:text-red-400"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <ResultsTable results={results as SearchResult[]} formatDate={formatDate} formatNum={formatNum} />
        </div>
      </DashboardLayout>
    );
  }

  // ── Search View ────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setView("list")} className="text-muted-foreground">
              <ArrowLeft className="w-4 h-4 mr-1" /> Reports
            </Button>
            <h1 className="text-xl font-bold text-foreground">New Search</h1>
          </div>
          {hasSearched && searchResults.length > 0 && (
            <Button
              onClick={() => setShowSaveModal(true)}
              className="bg-[#D8FE51] text-black hover:bg-[#c8ee41] font-semibold"
            >
              <Save className="w-4 h-4 mr-2" /> Save Report
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Search config */}
          <div className="lg:col-span-1 space-y-4">
            {/* Keywords */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Search className="w-4 h-4 text-[#D8FE51]" /> Keywords
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Add keyword..."
                    value={keywordInput}
                    onChange={e => setKeywordInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
                    className="bg-background border-border text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={addKeyword} className="border-border shrink-0">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {keywords.map(kw => (
                      <Badge key={kw} variant="secondary" className="flex items-center gap-1 text-xs">
                        {kw}
                        <button onClick={() => removeKeyword(kw)} className="ml-1 hover:text-red-400">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Mode:</span>
                  <Select value={keywordMode} onValueChange={(v) => setKeywordMode(v as "AND" | "OR")}>
                    <SelectTrigger className="h-7 w-20 text-xs bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OR">OR</SelectItem>
                      <SelectItem value="AND">AND</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    {keywordMode === "OR" ? "Any keyword matches" : "All keywords must appear"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Date Range */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#D8FE51]" /> Date Range
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Start date</label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-background border-border text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">End date</label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-background border-border text-sm" />
                </div>
                <p className="text-xs text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  X API Basic: 7-day history only
                </p>
              </CardContent>
            </Card>

            {/* KOL Filter */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#D8FE51]" /> KOLs
                  {selectedKolIds.length > 0 && <Badge className="bg-[#D8FE51] text-black text-xs">{selectedKolIds.length}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="relative">
                  <Input
                    placeholder="Search KOLs..."
                    value={kolSearch}
                    onChange={e => { setKolSearch(e.target.value); setShowKolDropdown(true); }}
                    onFocus={() => setShowKolDropdown(true)}
                    className="bg-background border-border text-sm"
                  />
                  {showKolDropdown && filteredKols.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                      {filteredKols.map(k => (
                        <div
                          key={k.id}
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-accent flex items-center justify-between ${selectedKolIds.includes(k.id) ? "text-[#D8FE51]" : "text-foreground"}`}
                          onClick={() => { toggleKol(k.id); setKolSearch(""); setShowKolDropdown(false); }}
                        >
                          <span>@{k.handle}</span>
                          {selectedKolIds.includes(k.id) && <span className="text-xs">✓</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {selectedKolIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedKolIds.map(id => {
                      const kol = kols.find(k => k.id === id);
                      return kol ? (
                        <Badge key={id} variant="secondary" className="text-xs flex items-center gap-1">
                          @{kol.handle}
                          <button onClick={() => toggleKol(id)}><X className="w-3 h-3" /></button>
                        </Badge>
                      ) : null;
                    })}
                  </div>
                )}
                {selectedKolIds.length > 20 && (
                  <p className="text-xs text-amber-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> X API supports max 20 KOLs per search
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Folders */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Folder className="w-4 h-4 text-[#D8FE51]" /> Folders
                  {selectedFolderIds.length > 0 && <Badge className="bg-[#D8FE51] text-black text-xs">{selectedFolderIds.length}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {folders.map((f: any) => (
                    <div
                      key={f.id}
                      className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer text-sm transition-colors ${selectedFolderIds.includes(f.id) ? "bg-[#D8FE51]/10 text-[#D8FE51]" : "hover:bg-accent text-foreground"}`}
                      onClick={() => toggleFolder(f.id)}
                    >
                      <span>{f.name}</span>
                      {selectedFolderIds.includes(f.id) && <span className="text-xs">✓</span>}
                    </div>
                  ))}
                  {folders.length === 0 && <p className="text-xs text-muted-foreground">No folders yet</p>}
                </div>
              </CardContent>
            </Card>

            {/* Language */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#D8FE51]" /> Language
                  {selectedLanguages.length > 0 && <Badge className="bg-[#D8FE51] text-black text-xs">{selectedLanguages.length}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {LANGUAGES.map(lang => (
                    <Badge
                      key={lang.code}
                      variant={selectedLanguages.includes(lang.code) ? "default" : "outline"}
                      className={`cursor-pointer text-xs ${selectedLanguages.includes(lang.code) ? "bg-[#D8FE51] text-black hover:bg-[#c8ee41]" : "border-border hover:border-[#D8FE51]/50"}`}
                      onClick={() => toggleLanguage(lang.code)}
                    >
                      {lang.label}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Region */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#D8FE51]" /> Region
                  {selectedRegions.length > 0 && <Badge className="bg-[#D8FE51] text-black text-xs">{selectedRegions.length}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {uniqueRegions.map(region => (
                    <Badge
                      key={region}
                      variant={selectedRegions.includes(region) ? "default" : "outline"}
                      className={`cursor-pointer text-xs ${selectedRegions.includes(region) ? "bg-[#D8FE51] text-black hover:bg-[#c8ee41]" : "border-border hover:border-[#D8FE51]/50"}`}
                      onClick={() => toggleRegion(region)}
                    >
                      {region}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add region..."
                    value={regionInput}
                    onChange={e => setRegionInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addRegion(); } }}
                    className="bg-background border-border text-xs h-7"
                  />
                  <Button size="sm" variant="outline" onClick={addRegion} className="border-border h-7 px-2">
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Max results */}
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <label className="text-xs text-muted-foreground mb-1 block">Max results (10–100)</label>
                <Input
                  type="number" min={10} max={100} value={maxResults}
                  onChange={e => setMaxResults(Number(e.target.value))}
                  className="bg-background border-border text-sm"
                />
              </CardContent>
            </Card>

            <Button
              onClick={handleSearch}
              disabled={keywords.length === 0 || searchMutation.isPending}
              className="w-full bg-[#D8FE51] text-black hover:bg-[#c8ee41] font-semibold"
            >
              {searchMutation.isPending ? (
                <><span className="animate-spin mr-2">⟳</span> Searching...</>
              ) : (
                <><Search className="w-4 h-4 mr-2" /> Run Search</>
              )}
            </Button>
          </div>

          {/* Right: Results */}
          <div className="lg:col-span-2">
            {!hasSearched && !searchMutation.isPending && (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Search className="w-10 h-10 text-muted-foreground opacity-30 mb-3" />
                <p className="text-muted-foreground text-sm">Configure your search and click Run Search</p>
              </div>
            )}
            {searchMutation.isPending && (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="w-8 h-8 border-2 border-[#D8FE51] border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-muted-foreground text-sm">Searching X API...</p>
                {searchQuery && <p className="text-xs text-muted-foreground mt-1 font-mono">{searchQuery.slice(0, 80)}</p>}
              </div>
            )}
            {hasSearched && !searchMutation.isPending && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {searchResults.length} results
                    {searchQuery && <span className="ml-2 font-mono text-xs opacity-60">{searchQuery.slice(0, 60)}{searchQuery.length > 60 ? "..." : ""}</span>}
                  </p>
                  {searchResults.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() => setShowSaveModal(true)}
                      className="bg-[#D8FE51] text-black hover:bg-[#c8ee41] font-semibold"
                    >
                      <Save className="w-4 h-4 mr-1" /> Save Report
                    </Button>
                  )}
                </div>
                {searchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-center">
                    <p className="text-muted-foreground text-sm">No tweets found. Try different keywords or a wider date range.</p>
                  </div>
                ) : (
                  <ResultsTable results={searchResults} formatDate={formatDate} formatNum={formatNum} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Modal */}
      <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Save Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Report name..."
              value={reportName}
              onChange={e => setReportName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
              className="bg-background border-border"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">{searchResults.length} results will be saved</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSaveModal(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="bg-[#D8FE51] text-black hover:bg-[#c8ee41]"
            >
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// ── Results Table Component ────────────────────────────────────────────────────

function ResultsTable({ results, formatDate, formatNum }: {
  results: SearchResult[];
  formatDate: (d: any) => string;
  formatNum: (n: any) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Author</th>
            <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Content</th>
            <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Date</th>
            <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Lang</th>
            <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">Likes</th>
            <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">RT</th>
            <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">Replies</th>
            <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground">Link</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={r.tweetId ?? i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
              <td className="px-3 py-2.5">
                <div className="font-medium text-foreground text-xs">@{r.authorHandle}</div>
                {r.authorName && <div className="text-xs text-muted-foreground truncate max-w-[100px]">{r.authorName}</div>}
                {r.kolId && <Badge variant="outline" className="text-[10px] mt-0.5 border-[#D8FE51]/40 text-[#D8FE51]">KOL</Badge>}
              </td>
              <td className="px-3 py-2.5 max-w-xs">
                <p className="text-xs text-foreground line-clamp-2">{r.content}</p>
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.postedAt)}</td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground uppercase">{r.language ?? "—"}</td>
              <td className="px-3 py-2.5 text-xs text-right text-foreground">{formatNum(r.likes)}</td>
              <td className="px-3 py-2.5 text-xs text-right text-foreground">{formatNum(r.retweets)}</td>
              <td className="px-3 py-2.5 text-xs text-right text-foreground">{formatNum(r.replies)}</td>
              <td className="px-3 py-2.5">
                {r.url && (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[#D8FE51] hover:text-[#c8ee41]">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
