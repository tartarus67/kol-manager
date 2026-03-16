import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, Edit2, ExternalLink, Users, TrendingUp, BarChart2,
  Star, Tag, MapPin, DollarSign, FileText,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

export default function KolDetail() {
  const { id } = useParams<{ id: string }>();
  const kolId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  const { data, isLoading } = trpc.kol.getById.useQuery(
    { id: kolId },
    { enabled: !isNaN(kolId) }
  );

  const updateMutation = trpc.kol.update.useMutation({
    onSuccess: () => {
      utils.kol.getById.invalidate({ id: kolId });
      toast.success("KOL updated");
      setEditOpen(false);
    },
    onError: () => toast.error("Failed to update KOL"),
  });

  function openEdit() {
    if (!data?.kol) return;
    const k = data.kol;
    setEditForm({
      handle: k.handle ?? "",
      displayName: k.displayName ?? "",
      platform: k.platform ?? "X",
      profileUrl: k.profileUrl ?? "",
      followers: k.followers?.toString() ?? "",
      smartFollowers: k.smartFollowers?.toString() ?? "",
      engagementRate: k.engagementRate?.toString() ?? "",
      avgEngagement: k.avgEngagement?.toString() ?? "",
      avgImpressions: k.avgImpressions?.toString() ?? "",
      score: k.score?.toString() ?? "",
      tier: k.tier ?? "",
      region: k.region ?? "",
      category: k.category ?? "",
      contentType: k.contentType ?? "",
      contentFormat: k.contentFormat ?? "",
      tags: k.tags ?? "",
      costPerPost: k.costPerPost?.toString() ?? "",
      status: k.status ?? "active",
      notes: k.notes ?? "",
    });
    setEditOpen(true);
  }

  function handleSave() {
    const parseOptNum = (v: string) => v.trim() !== "" ? parseFloat(v) : undefined;
    updateMutation.mutate({
      id: kolId,
      data: {
        handle: editForm.handle || undefined,
        displayName: editForm.displayName || undefined,
        platform: editForm.platform || undefined,
        profileUrl: editForm.profileUrl || undefined,
        followers: parseOptNum(editForm.followers),
        smartFollowers: parseOptNum(editForm.smartFollowers),
        engagementRate: parseOptNum(editForm.engagementRate),
        avgEngagement: parseOptNum(editForm.avgEngagement),
        avgImpressions: parseOptNum(editForm.avgImpressions),
        score: parseOptNum(editForm.score),
        tier: editForm.tier || undefined,
        region: editForm.region || undefined,
        category: editForm.category || undefined,
        contentType: editForm.contentType || undefined,
        contentFormat: editForm.contentFormat || undefined,
        tags: editForm.tags || undefined,
        costPerPost: parseOptNum(editForm.costPerPost),
        status: (editForm.status as "active" | "inactive" | "pending") || "active",
        notes: editForm.notes || undefined,
      },
    });
  }

  function fmt(n: number | null | undefined) {
    if (n == null) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-secondary rounded-lg animate-pulse" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  if (!data?.kol) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center text-muted-foreground">
          KOL not found.{" "}
          <button onClick={() => setLocation("/kols")} className="text-primary hover:underline">
            Back to list
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const { kol, posts } = data;
  const statusColors: Record<string, string> = {
    active: "bg-primary/15 text-primary border-primary/20",
    inactive: "bg-destructive/15 text-destructive border-destructive/20",
    pending: "bg-muted text-muted-foreground border-border",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-2">
        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => setLocation("/kols")}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex-1" />
          <Button
            variant="outline"
            onClick={openEdit}
            className="border-border text-foreground hover:bg-secondary gap-2"
          >
            <Edit2 className="h-4 w-4" /> Edit
          </Button>
        </div>

        {/* Identity Card */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="h-16 w-16 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center text-primary text-2xl font-bold shrink-0">
              {(kol.displayName || kol.handle).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-foreground">
                  {kol.displayName || kol.handle}
                </h1>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColors[kol.status]}`}>
                  {kol.status}
                </span>
              </div>
              <p className="text-muted-foreground text-sm mt-0.5">@{kol.handle} · {kol.platform}</p>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                {kol.region && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{kol.region}</span>}
                {kol.category && <span className="flex items-center gap-1"><Tag className="h-3 w-3" />{kol.category}</span>}
                {kol.tier && <span className="flex items-center gap-1"><Star className="h-3 w-3" />{kol.tier}</span>}
                {kol.source && <span className="text-muted-foreground/60">Source: {kol.source}</span>}
              </div>
              {kol.profileUrl && (
                <a
                  href={kol.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                >
                  <ExternalLink className="h-3 w-3" /> View Profile
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard icon={<Users className="h-4 w-4" />} label="Followers" value={fmt(kol.followers)} />
          <MetricCard icon={<Users className="h-4 w-4" />} label="Smart Followers" value={fmt(kol.smartFollowers)} />
          <MetricCard icon={<TrendingUp className="h-4 w-4" />} label="Eng. Rate" value={kol.engagementRate != null ? `${Number(kol.engagementRate).toFixed(2)}%` : "—"} highlight />
          <MetricCard icon={<BarChart2 className="h-4 w-4" />} label="Avg Engagement" value={fmt(kol.avgEngagement)} />
          <MetricCard icon={<BarChart2 className="h-4 w-4" />} label="Avg Impressions" value={fmt(kol.avgImpressions)} />
          <MetricCard icon={<Star className="h-4 w-4" />} label="Score" value={kol.score != null ? Number(kol.score).toFixed(2) : "—"} />
        </div>

        {/* Classification + Economics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoSection title="Classification">
            <InfoRow label="Content Type" value={kol.contentType} />
            <InfoRow label="Content Format" value={kol.contentFormat} />
            <InfoRow label="Tags" value={kol.tags} />
          </InfoSection>
          <InfoSection title="Economics">
            <InfoRow label="Cost per Post" value={kol.costPerPost != null ? `$${Number(kol.costPerPost).toFixed(2)}` : undefined} />
            <InfoRow label="Notes" value={kol.notes} />
          </InfoSection>
        </div>

        {/* Posts Table */}
        {posts.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Campaign Posts ({posts.length})
            </h2>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      {["Date", "Topic / Type", "Platform", "Views", "Likes", "Eng. Rate", "Cost", "Result", "Link"].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map(post => (
                      <tr key={post.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{post.postDate || "—"}</td>
                        <td className="px-3 py-2.5 max-w-[160px]">
                          <p className="text-foreground truncate">{post.topic || post.postTitle || "—"}</p>
                          {post.postType && <p className="text-muted-foreground">{post.postType}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{post.platform || "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-foreground">{post.views != null ? fmt(post.views) : "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-foreground">{post.likes != null ? fmt(post.likes) : "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-foreground">
                          {post.engagementRate != null ? `${Number(post.engagementRate).toFixed(2)}%` : "—"}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-foreground">
                          {post.costPerPost != null ? `$${Number(post.costPerPost).toFixed(0)}` : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          {post.result ? (
                            <span className="px-1.5 py-0.5 rounded bg-secondary text-foreground">{post.result}</span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          {post.postUrl ? (
                            <a
                              href={post.postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                              onClick={e => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit KOL: @{kol.handle}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <EditField label="Handle" value={editForm.handle} onChange={v => setEditForm(f => ({ ...f, handle: v }))} />
            <EditField label="Display Name" value={editForm.displayName} onChange={v => setEditForm(f => ({ ...f, displayName: v }))} />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Platform</Label>
              <Select value={editForm.platform} onValueChange={v => setEditForm(f => ({ ...f, platform: v }))}>
                <SelectTrigger className="bg-secondary border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {["X", "Telegram", "YouTube", "Instagram", "TikTok", "Other"].map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <EditField label="Profile URL" value={editForm.profileUrl} onChange={v => setEditForm(f => ({ ...f, profileUrl: v }))} />
            <EditField label="Followers" value={editForm.followers} onChange={v => setEditForm(f => ({ ...f, followers: v }))} type="number" />
            <EditField label="Smart Followers" value={editForm.smartFollowers} onChange={v => setEditForm(f => ({ ...f, smartFollowers: v }))} type="number" />
            <EditField label="Engagement Rate (%)" value={editForm.engagementRate} onChange={v => setEditForm(f => ({ ...f, engagementRate: v }))} type="number" />
            <EditField label="Avg Engagement" value={editForm.avgEngagement} onChange={v => setEditForm(f => ({ ...f, avgEngagement: v }))} type="number" />
            <EditField label="Avg Impressions" value={editForm.avgImpressions} onChange={v => setEditForm(f => ({ ...f, avgImpressions: v }))} type="number" />
            <EditField label="Score" value={editForm.score} onChange={v => setEditForm(f => ({ ...f, score: v }))} type="number" />
            <EditField label="Tier" value={editForm.tier} onChange={v => setEditForm(f => ({ ...f, tier: v }))} />
            <EditField label="Region" value={editForm.region} onChange={v => setEditForm(f => ({ ...f, region: v }))} />
            <EditField label="Category" value={editForm.category} onChange={v => setEditForm(f => ({ ...f, category: v }))} />
            <EditField label="Content Type" value={editForm.contentType} onChange={v => setEditForm(f => ({ ...f, contentType: v }))} />
            <EditField label="Content Format" value={editForm.contentFormat} onChange={v => setEditForm(f => ({ ...f, contentFormat: v }))} />
            <EditField label="Tags (comma-separated)" value={editForm.tags} onChange={v => setEditForm(f => ({ ...f, tags: v }))} />
            <EditField label="Cost per Post (USD)" value={editForm.costPerPost} onChange={v => setEditForm(f => ({ ...f, costPerPost: v }))} type="number" />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="bg-secondary border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea
                value={editForm.notes}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} className="border-border text-foreground hover:bg-secondary">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function MetricCard({ icon, label, value, highlight }: {
  icon: React.ReactNode; label: string; value: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border bg-card p-3 ${highlight ? "border-primary/30" : "border-border"}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={highlight ? "text-primary" : "text-muted-foreground"}>{icon}</span>
        <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium truncate">{label}</span>
      </div>
      <p className={`text-lg font-bold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-muted-foreground min-w-[120px] shrink-0">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function EditField({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
      />
    </div>
  );
}
