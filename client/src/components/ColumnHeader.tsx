import { useState, useRef, useEffect } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, Filter, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export type SortDir = "asc" | "desc" | null;

export interface ColumnHeaderProps {
  label: string;
  sortKey?: string;
  sortDir?: SortDir;
  onSort?: (key: string, dir: SortDir) => void;
  // For checkbox filter: pass unique values present in the column
  filterValues?: string[];
  selectedValues?: Set<string>;
  onFilterChange?: (values: Set<string>) => void;
  className?: string;
}

export function ColumnHeader({
  label,
  sortKey,
  sortDir,
  onSort,
  filterValues,
  selectedValues,
  onFilterChange,
  className = "",
}: ColumnHeaderProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSort = (dir: SortDir) => {
    if (sortKey && onSort) {
      onSort(sortKey, sortDir === dir ? null : dir);
    }
    setOpen(false);
  };

  const filtered = filterValues
    ? filterValues.filter((v) => v.toLowerCase().includes(keyword.toLowerCase()))
    : [];

  const toggleValue = (v: string) => {
    if (!onFilterChange || !selectedValues) return;
    const next = new Set(selectedValues);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onFilterChange(next);
  };

  const selectAll = () => {
    if (!onFilterChange || !filterValues) return;
    onFilterChange(new Set(filterValues));
  };

  const clearAll = () => {
    if (!onFilterChange) return;
    onFilterChange(new Set());
  };

  const hasFilter = filterValues && filterValues.length > 0;
  const isFiltered = selectedValues && selectedValues.size > 0 && selectedValues.size < (filterValues?.length ?? 0);
  const isSorted = sortDir !== null && sortDir !== undefined;

  return (
    <div ref={ref} className={`relative inline-flex items-center gap-1 select-none ${className}`}>
      <span className="font-medium text-xs tracking-wider uppercase text-muted-foreground">{label}</span>
      {(sortKey || hasFilter) && (
        <button
          onClick={() => setOpen((o) => !o)}
          className={`p-0.5 rounded hover:bg-white/10 transition-colors ${isSorted || isFiltered ? "text-yellow-400" : "text-muted-foreground"}`}
        >
          {sortDir === "asc" ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : sortDir === "desc" ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : isFiltered ? (
            <Filter className="w-3.5 h-3.5" />
          ) : (
            <ChevronsUpDown className="w-3.5 h-3.5" />
          )}
        </button>
      )}

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl overflow-hidden">
          {/* Sort options */}
          {sortKey && onSort && (
            <div className="border-b border-white/10">
              <button
                onClick={() => handleSort("asc")}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5 transition-colors ${sortDir === "asc" ? "text-yellow-400" : "text-foreground"}`}
              >
                <ChevronUp className="w-3.5 h-3.5" />
                Sort A → Z
                {sortDir === "asc" && <Check className="w-3.5 h-3.5 ml-auto" />}
              </button>
              <button
                onClick={() => handleSort("desc")}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5 transition-colors ${sortDir === "desc" ? "text-yellow-400" : "text-foreground"}`}
              >
                <ChevronDown className="w-3.5 h-3.5" />
                Sort Z → A
                {sortDir === "desc" && <Check className="w-3.5 h-3.5 ml-auto" />}
              </button>
            </div>
          )}

          {/* Filter by keyword + checkboxes */}
          {hasFilter && (
            <div>
              <div className="px-3 py-2 border-b border-white/10">
                <Input
                  placeholder="Filter by keyword..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="h-7 text-xs bg-white/5 border-white/10"
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
                <button onClick={selectAll} className="text-xs text-blue-400 hover:text-blue-300">Select all</button>
                <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <X className="w-3 h-3" /> Clear
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
                ) : (
                  filtered.map((v) => (
                    <button
                      key={v}
                      onClick={() => toggleValue(v)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/5 transition-colors text-left"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selectedValues?.has(v) ? "bg-yellow-400 border-yellow-400" : "border-white/20"}`}>
                        {selectedValues?.has(v) && <Check className="w-2.5 h-2.5 text-black" />}
                      </div>
                      <span className="truncate text-xs">{v || "(empty)"}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
