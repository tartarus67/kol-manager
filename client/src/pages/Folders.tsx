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
import { trpc } from "@/lib/trpc";
import { FolderOpen, FolderPlus, Pencil, Trash2, Users, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Folders() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [createOpen, setCreateOpen] = useState(false);
  const [editFolder, setEditFolder] = useState<{ id: number; name: string; description: string | null } | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

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
      setNewName("");
      setNewDesc("");
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

  function openEdit(f: { id: number; name: string; description: string | null }) {
    setEditFolder(f);
    setEditName(f.name);
    setEditDesc(f.description ?? "");
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
                  onClick={() => setExpandedId(expandedId === folder.id ? null : folder.id)}
                >
                  <FolderOpen className={`h-5 w-5 shrink-0 ${expandedId === folder.id ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{folder.name}</p>
                    {folder.description && (
                      <p className="text-xs text-muted-foreground truncate">{folder.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {folder.kolCount}
                    </span>
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
                            <tr key={kol.id} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
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
                                {kol.followers != null
                                  ? kol.followers >= 1_000_000 ? `${(kol.followers / 1_000_000).toFixed(1)}M`
                                  : kol.followers >= 1_000 ? `${(kol.followers / 1_000).toFixed(1)}K`
                                  : kol.followers.toString()
                                  : "—"}
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
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="border-border text-foreground hover:bg-secondary">
              Cancel
            </Button>
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
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="bg-secondary border-border text-foreground"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <Input
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                className="bg-secondary border-border text-foreground"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditFolder(null)} className="border-border text-foreground hover:bg-secondary">
              Cancel
            </Button>
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
