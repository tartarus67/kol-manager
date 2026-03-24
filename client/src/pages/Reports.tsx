import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search, Plus, X, Save, Download, Trash2, FileText,
  ChevronRight, Calendar, Users, Globe, Folder, AlertCircle,
  ExternalLink, ArrowLeft, ChevronLeft, ChevronDown, RefreshCw,
  CheckSquare, Square, FolderPlus, Bookmark, BookmarkCheck,
} from "lucide-react";
import { ColumnHeader, SortDir as ColSortDir } from "@/components/ColumnHeader";

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
  views?: number | null;
  bookmarks?: number | null;
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

// ── Smart keyword parser ────────────────────────────────────────────────────
// Parses natural language input into keywords + mode
// "@AethirCloud $ATH" → ["@AethirCloud", "$ATH"] AND
// "aethir OR cloud" → ["aethir", "cloud"] OR
// "aethir cloud" → ["aethir", "cloud"] AND
function parseSmartKeywords(input: string): { keywords: string[]; mode: "AND" | "OR" } {
  const trimmed = input.trim();
  if (!trimmed) return { keywords: [], mode: "AND" };

  // Check for explicit OR
  if (/\bOR\b/i.test(trimmed)) {
    const parts = trimmed.split(/\bOR\b/i).map(s => s.trim()).filter(Boolean);
    return { keywords: parts, mode: "OR" };
  }

  // Split on whitespace (handles @handles, $tickers, quoted strings)
  const tokens: string[] = [];
  const regex = /"[^"]+"|'[^']+'|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(trimmed)) !== null) {
    tokens.push(m[0].replace(/^["']|["']$/g, ""));
  }

  return { keywords: tokens, mode: "AND" };
}

// ── Mini Calendar Picker ────────────────────────────────────────────────────
function CalendarPicker({
  value,
  onChange,
  placeholder,
  maxDate,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => {
    if (value) return new Date(value).getFullYear();
    return new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    if (value) return new Date(value).getMonth();
    return new Date().getMonth();
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  function selectDate(day: number) {
    const d = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (maxDate && d > maxDate) return;
    onChange(d);
    setOpen(false);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const selectedDay = value ? new Date(value + "T00:00:00").getDate() : null;
  const selectedMonth = value ? new Date(value + "T00:00:00").getMonth() : null;
  const selectedYear = value ? new Date(value + "T00:00:00").getFullYear() : null;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-border bg-background text-sm text-left hover:border-[#D8FE51]/50 transition-colors"
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {value || placeholder}
        </span>
        <div className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); onChange(""); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-card border border-border rounded-lg shadow-xl p-3">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-2">
            <button onClick={prevMonth} className="p-1 hover:bg-accent rounded">
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <span className="text-sm font-semibold text-foreground">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} className="p-1 hover:bg-accent rounded">
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-[10px] text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelected = day === selectedDay && viewMonth === selectedMonth && viewYear === selectedYear;
              const isToday = dateStr === todayStr;
              const isDisabled = maxDate ? dateStr > maxDate : false;
              return (
                <button
                  key={day}
                  onClick={() => !isDisabled && selectDate(day)}
                  disabled={isDisabled}
                  className={`
                    text-center text-xs py-1.5 rounded transition-colors
                    ${isSelected ? "bg-[#D8FE51] text-black font-bold" : ""}
                    ${isToday && !isSelected ? "border border-[#D8FE51]/50 text-[#D8FE51]" : ""}
                    ${!isSelected && !isDisabled ? "hover:bg-accent text-foreground" : ""}
                    ${isDisabled ? "opacity-30 cursor-not-allowed text-muted-foreground" : "cursor-pointer"}
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Quick shortcuts */}
          <div className="flex gap-1 mt-2 pt-2 border-t border-border">
            {[
              { label: "Today", days: 0 },
              { label: "-3d", days: 3 },
              { label: "-7d", days: 7 },
            ].map(({ label, days }) => {
              const d = new Date();
              d.setDate(d.getDate() - days);
              const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              return (
                <button
                  key={label}
                  onClick={() => { onChange(str); setOpen(false); }}
                  className="flex-1 text-[10px] py-1 rounded bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Smart Search Bar ────────────────────────────────────────────────────────
function SmartSearchBar({
  value,
  onChange,
  onParse,
  parsedKeywords,
  parsedMode,
}: {
  value: string;
  onChange: (v: string) => void;
  onParse: (keywords: string[], mode: "AND" | "OR") => void;
  parsedKeywords: string[];
  parsedMode: "AND" | "OR";
}) {
  const [focused, setFocused] = useState(false);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const parsed = parseSmartKeywords(value);
      onParse(parsed.keywords, parsed.mode);
    }
  }

  function handleChange(v: string) {
    onChange(v);
    // Live parse preview
    if (v.trim()) {
      const parsed = parseSmartKeywords(v);
      onParse(parsed.keywords, parsed.mode);
    } else {
      onParse([], "AND");
    }
  }

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-colors bg-background ${focused ? "border-[#D8FE51]/60" : "border-border"}`}>
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          value={value}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder='e.g. @AethirCloud $ATH  or  "aethir OR cloud"'
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
        {value && (
          <button onClick={() => { onChange(""); onParse([], "AND"); }} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {parsedKeywords.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Parsed:</span>
          {parsedKeywords.map((kw, i) => (
            <span key={kw} className="flex items-center gap-1">
              <Badge variant="secondary" className="text-xs px-2 py-0.5">{kw}</Badge>
              {i < parsedKeywords.length - 1 && (
                <span className={`text-[10px] font-bold ${parsedMode === "OR" ? "text-amber-400" : "text-[#D8FE51]"}`}>
                  {parsedMode}
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Separate with spaces for AND · use "OR" between terms for OR · supports @handles and $tickers
      </p>
    </div>
  );
}

export default function Reports() {
  const [view, setView] = useState<"list" | "search" | "detail">("list");
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  // Smart search bar state
  const [searchBarValue, setSearchBarValue] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordMode, setKeywordMode] = useState<"AND" | "OR">("AND");

  // Date range state
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Filter state
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

  // Missing KOL popup state
  const [missingHandles, setMissingHandles] = useState<string[]>([]);
  const [showMissingKolModal, setShowMissingKolModal] = useState(false);
  const [selectedMissingHandles, setSelectedMissingHandles] = useState<Set<string>>(new Set());
  const [missingKolFolderIds, setMissingKolFolderIds] = useState<number[]>([]);
  const [missingKolCampaignId, setMissingKolCampaignId] = useState<number | null>(null);
  const [creatingMissingKols, setCreatingMissingKols] = useState(false);

  // Save modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [reportName, setReportName] = useState("");
  const [showSaveAsCampaignModal, setShowSaveAsCampaignModal] = useState(false);
  const [saveAsCampaignName, setSaveAsCampaignName] = useState("");
  const [showSavedSearchDropdown, setShowSavedSearchDropdown] = useState(false);

  // KOL selector state
  const [kolSearch, setKolSearch] = useState("");
  const [showKolDropdown, setShowKolDropdown] = useState(false);

  // Data queries
  const { data: kolsData } = trpc.kol.list.useQuery({});
  const { data: foldersData } = trpc.folder.list.useQuery();
  const { data: reportsData, refetch: refetchReports } = trpc.report.list.useQuery();
  const { data: reportDetail } = trpc.report.getById.useQuery(
    { id: selectedReportId! },
    { enabled: !!selectedReportId && view === "detail" }
  );

  const importHandlesMutation = trpc.kol.importHandles.useMutation();
  const addToFolderMutation = trpc.folder.addKols.useMutation();
  const { data: campaignsData } = trpc.campaign.list.useQuery();

  const searchMutation = trpc.report.search.useMutation({
    onSuccess: (data) => {
      if (!data.success) {
        toast.error(data.message ?? "Search failed");
        return;
      }
      setSearchResults(data.results as SearchResult[]);
      setSearchQuery((data as any).query ?? "");
      setHasSearched(true);
      const missing = (data as any).missingHandles as string[] | undefined;
      if (missing && missing.length > 0) {
        setMissingHandles(missing);
        setSelectedMissingHandles(new Set(missing));
        setShowMissingKolModal(true);
        toast.success(`Found ${data.results.length} tweets — ${missing.length} new KOL${missing.length > 1 ? 's' : ''} detected`);
      } else {
        toast.success(`Found ${data.results.length} tweets`);
      }
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

  const utils = trpc.useUtils();

  const { data: savedSearches = [] } = trpc.savedSearch.list.useQuery();
  const saveSearchMutation = trpc.savedSearch.save.useMutation({
    onSuccess: () => { utils.savedSearch.list.invalidate(); toast.success("Search saved"); },
    onError: () => toast.error("Failed to save search"),
  });
  const deleteSearchMutation = trpc.savedSearch.delete.useMutation({
    onSuccess: () => utils.savedSearch.list.invalidate(),
  });

  const saveAsCampaignMutation = trpc.report.saveAsCampaign.useMutation({
    onSuccess: (data) => {
      toast.success("Saved as campaign");
      setShowSaveAsCampaignModal(false);
      setSaveAsCampaignName("");
    },
    onError: (err) => toast.error(err.message),
  });

  const rerunMutation = trpc.report.rerun.useMutation({
    onSuccess: (data) => {
      toast.success(`Refreshed ${data.updated} tweets${data.failed > 0 ? `, ${data.failed} failed` : ""}`);
      utils.report.getById.invalidate({ id: selectedReportId! });
    },
    onError: (err) => toast.error(err.message),
  });

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
    if (keywords.length === 0) { toast.error("Enter at least one keyword"); return; }
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
    setSearchBarValue("");
    setKeywords([]);
    setKeywordMode("AND");
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

  function applySavedSearch(ss: any) {
    const kws = (() => { try { return JSON.parse(ss.keywords) as string[]; } catch { return [ss.keywords]; } })();
    setKeywords(kws);
    setKeywordMode(ss.keywordMode ?? "AND");
    setSearchBarValue(kws.join(ss.keywordMode === "OR" ? " OR " : " "));
    setShowSavedSearchDropdown(false);
    setView("search");
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
                        <Badge variant="outline" className="text-xs shrink-0">{report.keywordMode ?? "AND"}</Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1 ml-7">
                        <span className="text-xs text-muted-foreground">
                          {kws.slice(0, 3).map((k: string) => `"${k}"`).join(`, `)}
                          {kws.length > 3 ? ` +${kws.length - 3}` : ""}
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
                  {kws.map((k: string) => `"${k}"`).join(` ${report.keywordMode ?? "AND"} `)}
                  {report.startDate && ` · ${report.startDate} → ${report.endDate ?? "now"}`}
                  {` · ${results.length} results`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => rerunMutation.mutate({ id: report.id })}
                disabled={rerunMutation.isPending}
                className="border-border"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${rerunMutation.isPending ? 'animate-spin' : ''}`} />
                {rerunMutation.isPending ? "Refreshing..." : "Refresh Metrics"}
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => { setSaveAsCampaignName(report.name); setShowSaveAsCampaignModal(true); }}
                className="border-border"
              >
                <FolderPlus className="w-4 h-4 mr-2" /> Save as Campaign
              </Button>
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
            <div className="flex items-center gap-2">
              {/* Saved searches dropdown */}
              <div className="relative">
                <Button
                  variant="outline" size="sm"
                  className="border-border text-foreground gap-1.5"
                  onClick={() => setShowSavedSearchDropdown(o => !o)}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  Saved Searches
                  <ChevronDown className="w-3 h-3" />
                </Button>
                {showSavedSearchDropdown && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-border">
                      <Button
                        size="sm" className="w-full text-xs bg-[#D8FE51] text-black hover:bg-[#c8ee41]"
                        onClick={() => {
                          if (!keywords.length) return;
                          const name = prompt("Save search as:");
                          if (name) saveSearchMutation.mutate({ name, keywords, keywordMode });
                          setShowSavedSearchDropdown(false);
                        }}
                      >
                        <BookmarkCheck className="w-3.5 h-3.5 mr-1" /> Save current search
                      </Button>
                    </div>
                    {savedSearches.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-3 text-center">No saved searches yet</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto">
                        {savedSearches.map((ss: any) => (
                          <div key={ss.id} className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/30 cursor-pointer group">
                            <div className="flex-1 min-w-0" onClick={() => applySavedSearch(ss)}>
                              <p className="text-xs font-medium text-foreground truncate">{ss.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {(() => { try { return (JSON.parse(ss.keywords) as string[]).join(` ${ss.keywordMode} `); } catch { return ss.keywords; } })()
                                }
                              </p>
                            </div>
                            <button
                              onClick={() => deleteSearchMutation.mutate({ id: ss.id })}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <Button
                onClick={() => setShowSaveModal(true)}
                className="bg-[#D8FE51] text-black hover:bg-[#c8ee41] font-semibold"
              >
                <Save className="w-4 h-4 mr-2" /> Save Report
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Search config */}
          <div className="lg:col-span-1 space-y-4">

            {/* Smart Keywords */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Search className="w-4 h-4 text-[#D8FE51]" /> Keywords
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SmartSearchBar
                  value={searchBarValue}
                  onChange={setSearchBarValue}
                  onParse={(kws, mode) => { setKeywords(kws); setKeywordMode(mode); }}
                  parsedKeywords={keywords}
                  parsedMode={keywordMode}
                />
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
                  <CalendarPicker
                    value={startDate}
                    onChange={setStartDate}
                    placeholder="Pick start date"
                    maxDate={endDate || undefined}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">End date</label>
                  <CalendarPicker
                    value={endDate}
                    onChange={setEndDate}
                    placeholder="Pick end date"
                  />
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
                      {filteredKols.map((k: any) => (
                        <div
                          key={k.id}
                          className={`flex items-center justify-between px-3 py-2 cursor-pointer text-sm transition-colors ${selectedKolIds.includes(k.id) ? "bg-[#D8FE51]/10 text-[#D8FE51]" : "hover:bg-accent text-foreground"}`}
                          onClick={() => { toggleKol(k.id); setShowKolDropdown(false); setKolSearch(""); }}
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
                      const k = kols.find((x: any) => x.id === id);
                      return k ? (
                        <Badge key={id} variant="secondary" className="text-xs flex items-center gap-1">
                          @{k.handle}
                          <button onClick={() => toggleKol(id)} className="ml-1 hover:text-red-400">
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ) : null;
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Folder Filter */}
            {folders.length > 0 && (
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
                  </div>
                </CardContent>
              </Card>
            )}

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

      {/* Missing KOL Modal */}
      <Dialog open={showMissingKolModal} onOpenChange={setShowMissingKolModal}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-foreground">
              {missingHandles.length} New KOL{missingHandles.length > 1 ? 's' : ''} Detected
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0 pr-1">
            <p className="text-sm text-muted-foreground">
              These handles appeared in your search results but aren't in your KOL database yet.
              Select which ones to add:
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {missingHandles.map(handle => (
                <label key={handle} className="flex items-center gap-2.5 cursor-pointer hover:bg-muted/30 rounded px-2 py-1">
                  <input
                    type="checkbox"
                    checked={selectedMissingHandles.has(handle)}
                    onChange={e => {
                      const next = new Set(selectedMissingHandles);
                      if (e.target.checked) next.add(handle); else next.delete(handle);
                      setSelectedMissingHandles(next);
                    }}
                    className="accent-[#D8FE51]"
                  />
                  <span className="text-sm text-foreground font-mono">@{handle}</span>
                </label>
              ))}
            </div>

            {/* Folder assignment */}
            {foldersData && foldersData.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add to Folder (optional)</p>
                <div className="flex flex-wrap gap-1.5">
                  {foldersData.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setMissingKolFolderIds(prev =>
                        prev.includes(f.id) ? prev.filter(id => id !== f.id) : [...prev, f.id]
                      )}
                      className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                        missingKolFolderIds.includes(f.id)
                          ? 'bg-[#D8FE51] text-black border-[#D8FE51]'
                          : 'bg-transparent text-muted-foreground border-border hover:border-[#D8FE51]/50'
                      }`}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Campaign assignment */}
            {campaignsData && campaignsData.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add to Campaign (optional)</p>
                <div className="flex flex-wrap gap-1.5">
                  {campaignsData.map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => setMissingKolCampaignId(prev => prev === c.id ? null : c.id)}
                      className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                        missingKolCampaignId === c.id
                          ? 'bg-[#D8FE51] text-black border-[#D8FE51]'
                          : 'bg-transparent text-muted-foreground border-border hover:border-[#D8FE51]/50'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 pt-2 border-t border-border">
            <Button variant="ghost" onClick={() => setShowMissingKolModal(false)}>Skip</Button>
            <Button
              disabled={selectedMissingHandles.size === 0 || creatingMissingKols}
              onClick={async () => {
                setCreatingMissingKols(true);
                try {
                  const handles = [...selectedMissingHandles];
                  const result = await importHandlesMutation.mutateAsync({ handles });
                  // Add to folders if selected
                  if (missingKolFolderIds.length > 0 && result.insertedIds.length > 0) {
                    for (const folderId of missingKolFolderIds) {
                      await addToFolderMutation.mutateAsync({ kolIds: result.insertedIds, folderId });
                    }
                  }
                  toast.success(`Added ${result.inserted} KOL${result.inserted > 1 ? 's' : ''} to database`);
                  setShowMissingKolModal(false);
                  setMissingKolFolderIds([]);
                  setMissingKolCampaignId(null);
                } catch (err: any) {
                  toast.error(err.message ?? 'Failed to create KOL profiles');
                } finally {
                  setCreatingMissingKols(false);
                }
              }}
              className="bg-[#D8FE51] text-black hover:bg-[#c8ee41]"
            >
              {creatingMissingKols ? 'Creating...' : `Add ${selectedMissingHandles.size} KOL${selectedMissingHandles.size > 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as Campaign Modal */}
      <Dialog open={showSaveAsCampaignModal} onOpenChange={setShowSaveAsCampaignModal}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Save Report as Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Campaign name..."
              value={saveAsCampaignName}
              onChange={e => setSaveAsCampaignName(e.target.value)}
              className="bg-background border-border"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">A new campaign will be created with all tweets from this report.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSaveAsCampaignModal(false)}>Cancel</Button>
            <Button
              onClick={() => selectedReportId && saveAsCampaignMutation.mutate({ id: selectedReportId, campaignName: saveAsCampaignName.trim() })}
              disabled={!saveAsCampaignName.trim() || saveAsCampaignMutation.isPending}
              className="bg-[#D8FE51] text-black hover:bg-[#c8ee41]"
            >
              {saveAsCampaignMutation.isPending ? "Creating..." : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

type ReportSortKey = "authorHandle" | "postedAt" | "language" | "views" | "likes" | "retweets" | "replies" | "quotes" | "bookmarks";

function ResultsTable({ results, formatDate, formatNum }: {
  results: SearchResult[];
  formatDate: (d: any) => string;
  formatNum: (n: any) => string;
}) {
  const [sortKey, setSortKey] = useState<ReportSortKey | null>(null);
  const [sortDir, setSortDir] = useState<ColSortDir>(null);
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({});
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  function handleSort(key: string, dir: ColSortDir) {
    setSortKey(dir ? key as ReportSortKey : null);
    setSortDir(dir);
  }

  function setColFilter(key: string, values: Set<string>) {
    setColFilters(prev => ({ ...prev, [key]: values }));
  }

  const colValues = useMemo(() => ({
    authorHandle: Array.from(new Set(results.map(r => r.authorHandle ?? ""))).sort(),
    language: Array.from(new Set(results.map(r => r.language ?? ""))).sort(),
  }), [results]);

  const displayed = useMemo(() => {
    let list = [...results];
    // Apply column filters
    for (const [key, values] of Object.entries(colFilters)) {
      if (values.size === 0) continue;
      list = list.filter(r => values.has(String((r as any)[key] ?? "")));
    }
    // Sort
    if (sortKey && sortDir) {
      list.sort((a, b) => {
        let av: any = (a as any)[sortKey];
        let bv: any = (b as any)[sortKey];
        if (av instanceof Date) av = av.getTime();
        if (bv instanceof Date) bv = bv.getTime();
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
  }, [results, sortKey, sortDir, colFilters]);

  function toggleRow(id: string) {
    setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleAll() {
    if (selectedRows.size === displayed.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(displayed.map(r => r.tweetId ?? r.url ?? String(Math.random()))));
  }
  function exportSelectedCsv() {
    const sel = displayed.filter(r => selectedRows.has(r.tweetId ?? r.url ?? ""));
    const rows = sel.length > 0 ? sel : displayed;
    const headers = ["Author Handle", "Author Name", "Content", "Posted At", "Language", "Views", "Likes", "RT", "Replies", "QT", "Saves", "URL"];
    const csvRows = rows.map(r => [
      r.authorHandle ?? "", r.authorName ?? "", r.content ?? "",
      r.postedAt ? new Date(r.postedAt).toISOString() : "",
      r.language ?? "", r.views ?? "", r.likes ?? "", r.retweets ?? "",
      r.replies ?? "", r.quotes ?? "", r.bookmarks ?? "", r.url ?? "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "report_results.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-2">
      {/* Bulk action bar */}
      {selectedRows.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-xs text-primary font-medium">{selectedRows.size} selected</span>
          <Button size="sm" variant="outline" className="h-6 text-xs gap-1 border-border text-foreground" onClick={exportSelectedCsv}>
            <Download className="h-3 w-3" /> Export CSV
          </Button>
          <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={() => setSelectedRows(new Set())}>Clear</Button>
        </div>
      )}
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-3 py-2.5 w-8">
              <button onClick={toggleAll}>
                {selectedRows.size === displayed.length && displayed.length > 0
                  ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                  : <Square className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </th>
            <th className="text-left px-3 py-2.5 whitespace-nowrap">
              <ColumnHeader label="Author" sortKey="authorHandle" sortDir={sortKey==="authorHandle"?sortDir:null} onSort={handleSort} filterValues={colValues.authorHandle} selectedValues={colFilters.authorHandle??new Set()} onFilterChange={(v)=>setColFilter("authorHandle",v)} />
            </th>
            <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Content</th>
            <th className="text-left px-3 py-2.5 whitespace-nowrap">
              <ColumnHeader label="Date" sortKey="postedAt" sortDir={sortKey==="postedAt"?sortDir:null} onSort={handleSort} />
            </th>
            <th className="text-left px-3 py-2.5">
              <ColumnHeader label="Lang" sortKey="language" sortDir={sortKey==="language"?sortDir:null} onSort={handleSort} filterValues={colValues.language} selectedValues={colFilters.language??new Set()} onFilterChange={(v)=>setColFilter("language",v)} />
            </th>
            <th className="text-right px-3 py-2.5">
              <ColumnHeader label="Views" sortKey="views" sortDir={sortKey==="views"?sortDir:null} onSort={handleSort} />
            </th>
            <th className="text-right px-3 py-2.5">
              <ColumnHeader label="Likes" sortKey="likes" sortDir={sortKey==="likes"?sortDir:null} onSort={handleSort} />
            </th>
            <th className="text-right px-3 py-2.5">
              <ColumnHeader label="RT" sortKey="retweets" sortDir={sortKey==="retweets"?sortDir:null} onSort={handleSort} />
            </th>
            <th className="text-right px-3 py-2.5">
              <ColumnHeader label="Replies" sortKey="replies" sortDir={sortKey==="replies"?sortDir:null} onSort={handleSort} />
            </th>
            <th className="text-right px-3 py-2.5">
              <ColumnHeader label="QT" sortKey="quotes" sortDir={sortKey==="quotes"?sortDir:null} onSort={handleSort} />
            </th>
            <th className="text-right px-3 py-2.5">
              <ColumnHeader label="Saves" sortKey="bookmarks" sortDir={sortKey==="bookmarks"?sortDir:null} onSort={handleSort} />
            </th>
            <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground">Link</th>
          </tr>
        </thead>
        <tbody>
          {displayed.map((r, i) => {
            const rowId = r.tweetId ?? r.url ?? String(i);
            return (
            <tr key={r.tweetId ?? i} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${selectedRows.has(rowId) ? 'bg-primary/5' : ''}`}>
              <td className="px-3 py-2.5">
                <button onClick={() => toggleRow(rowId)}>
                  {selectedRows.has(rowId)
                    ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                    : <Square className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </td>
              <td className="px-3 py-2.5">
                <div className="font-medium text-foreground text-xs whitespace-nowrap">@{r.authorHandle}</div>
                {r.authorName && <div className="text-xs text-muted-foreground truncate max-w-[100px]">{r.authorName}</div>}
                {r.kolId && <Badge variant="outline" className="text-[10px] mt-0.5 border-[#D8FE51]/40 text-[#D8FE51]">KOL</Badge>}
              </td>
              <td className="px-3 py-2.5 max-w-xs">
                <p className="text-xs text-foreground line-clamp-2">{r.content}</p>
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.postedAt)}</td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground uppercase">{r.language ?? "—"}</td>
              <td className="px-3 py-2.5 text-xs text-right text-muted-foreground">{formatNum(r.views)}</td>
              <td className="px-3 py-2.5 text-xs text-right text-foreground">{formatNum(r.likes)}</td>
              <td className="px-3 py-2.5 text-xs text-right text-foreground">{formatNum(r.retweets)}</td>
              <td className="px-3 py-2.5 text-xs text-right text-foreground">{formatNum(r.replies)}</td>
              <td className="px-3 py-2.5 text-xs text-right text-foreground">{formatNum(r.quotes)}</td>
              <td className="px-3 py-2.5 text-xs text-right text-muted-foreground">{formatNum(r.bookmarks)}</td>
              <td className="px-3 py-2.5">
                {r.url && (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[#D8FE51] hover:text-[#c8ee41]">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </td>
            </tr>
          );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}
