"use client";

/* Saved sources can use arbitrary remote thumbnail hosts. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, Captions, Check, ChevronDown, ChevronLeft, ChevronRight, Database,
  ExternalLink, File, Folder, FolderOpen, FolderPlus, Grid2X2, LoaderCircle,
  MoreHorizontal, PanelLeftClose, PanelLeftOpen, PanelRightClose, Pencil, Plus, Rows3, RotateCcw, Search,
  Sparkles, Trash2, Undo2, X,
} from "lucide-react";
import type { Board, ContentItem, Folder as VaultFolder } from "@/lib/types";

type PanelMode = "detail";
type ViewMode = "grid" | "list";
type NavigationTarget = { type: "board" | "folder"; id: string };
type ContextMenuState = NavigationTarget & { x: number; y: number };
type ItemMenuState = { id: string; x: number; y: number };
type MenuPosition = { left: number; top: number };
type NavigationDialog =
  | { kind: "create-board"; folderId: string | null; value: string }
  | { kind: "create-folder"; parentId: string | null; value: string }
  | { kind: "rename"; target: NavigationTarget; value: string }
  | { kind: "move"; target: NavigationTarget; destinationId: string };
type TrashEntry = { id: string; name?: string; title?: string; source_type?: string; board_name?: string; folder_name?: string; item_count?: number; board_count?: number; trashed_at: string };
type TrashData = { folders: TrashEntry[]; boards: TrashEntry[]; items: TrashEntry[] };
type UndoTarget = { type: NavigationTarget["type"] | "item"; id: string };
type UndoAction =
  | { kind: "restore"; label: string; targets: UndoTarget[] }
  | { kind: "trash"; label: string; targets: UndoTarget[] }
  | { kind: "patch"; label: string; target: NavigationTarget; body: Record<string, string | null> };

const DEFAULT_BOARD_ID = "11111111-1111-4111-8111-111111111111";

function sourceLabel(item: ContentItem) {
  if (item.source_type === "youtube") return "YouTube Video";
  if (item.source_type === "article") return "Web Source";
  if (item.source_type === "note") return "Note";
  if (item.source_type === "document" && item.mime_type === "application/pdf") return "PDF Document";
  if (item.source_type === "document") return "Document";
  if (item.source_type === "image") return "Image";
  if (item.source_type === "video") return "Video";
  if (item.source_type === "audio") return "Audio";
  return "File";
}

function previewUrl(item: ContentItem) {
  if (item.thumbnail_url) return item.thumbnail_url;
  if (item.preview_path || item.mime_type?.startsWith("image/")) return `/api/items/${item.id}/preview`;
  return null;
}

function youtubeEmbed(item: ContentItem) {
  return item.external_id ? `https://www.youtube.com/embed/${item.external_id}?rel=0&modestbranding=1` : null;
}

function youtubeOrientation(item: ContentItem) {
  if (item.source_type !== "youtube") return null;
  const savedOrientation = item.metadata.canvasOrientation;
  if (savedOrientation === "portrait" || savedOrientation === "landscape") return savedOrientation;
  const width = typeof item.metadata.width === "number" ? item.metadata.width : null;
  const height = typeof item.metadata.height === "number" ? item.metadata.height : null;
  const aspectRatio = typeof item.metadata.aspect_ratio === "number" ? item.metadata.aspect_ratio : null;
  if ((width && height && height > width) || (aspectRatio && aspectRatio < 1)) return "portrait";
  return "landscape";
}

function youtubeDetails(item: ContentItem) {
  const details: string[] = [];
  if (item.author && item.author !== "YouTube") details.push(item.author);
  if (typeof item.view_count === "number") {
    details.push(`${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(item.view_count)} views`);
  }
  return details.join(" · ") || "YouTube";
}

function durationLabel(seconds: number | null) {
  if (!seconds) return null;
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function urlsFromText(text: string) {
  return text.match(/https?:\/\/[^\s<>"']+/gi) || [];
}

function titleForPlainText(text: string) {
  return text.split(/\r?\n/).find(Boolean)?.slice(0, 100) || "Pasted note";
}

export function VaultApp() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [folderTreeLoaded, setFolderTreeLoaded] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [itemMenu, setItemMenu] = useState<ItemMenuState | null>(null);
  const [createMenu, setCreateMenu] = useState<MenuPosition | null>(null);
  const [navigationDialog, setNavigationDialog] = useState<NavigationDialog | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [trash, setTrash] = useState<TrashData>({ folders: [], boards: [], items: [] });
  const [currentBoardId, setCurrentBoardId] = useState(DEFAULT_BOARD_ID);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [howToUseOpen, setHowToUseOpen] = useState(false);
  const [workspaceDir, setWorkspaceDir] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [undoBusy, setUndoBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarPreferenceLoaded, setSidebarPreferenceLoaded] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const itemClickTimer = useRef<number | null>(null);

  const currentBoard = boards.find((board) => board.id === currentBoardId);
  const activeItem = items.find((item) => item.id === activeItemId) || null;
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => [item.title, item.author, item.file_name, item.description].some((value) => value?.toLowerCase().includes(needle)));
  }, [items, query]);

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const loadBoards = useCallback(async () => {
    const response = await fetch("/api/boards", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setBoards(data.boards);
    if (!data.boards.some((board: Board) => board.id === currentBoardId) && data.boards[0]) setCurrentBoardId(data.boards[0].id);
  }, [currentBoardId]);

  const loadFolders = useCallback(async () => {
    const response = await fetch("/api/folders", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setFolders(data.folders);
    setExpandedFolders((current) => {
      if (current.size) return current;
      const saved = window.localStorage.getItem("canvas-v4-expanded-folders") || window.localStorage.getItem("osiris-vault-expanded-folders");
      if (saved) {
        try { return new Set(JSON.parse(saved) as string[]); } catch { /* Use the default below. */ }
      }
      return new Set((data.folders as VaultFolder[]).map((folder) => folder.id));
    });
    setFolderTreeLoaded(true);
  }, []);

  const loadTrash = useCallback(async () => {
    const response = await fetch("/api/trash", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setTrash(data);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/items?board=${encodeURIComponent(currentBoardId)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setItems(data.items);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load this board.", true);
    } finally {
      setLoading(false);
    }
  }, [currentBoardId, notify]);

  const recordUndo = useCallback((action: UndoAction) => {
    setUndoStack([action]);
  }, []);

  const executeUndoAction = useCallback(async (action: UndoAction) => {
    if (action.kind === "restore") {
      for (const target of action.targets) {
        const response = await fetch("/api/trash/restore", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(target),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not restore the previous action.");
      }
    }
    if (action.kind === "trash") {
      for (const target of action.targets) {
        const collection = target.type === "item" ? "items" : target.type === "board" ? "boards" : "folders";
        const response = await fetch(`/api/${collection}/${target.id}`, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not undo the previous action.");
      }
    }
    if (action.kind === "patch") {
      const collection = action.target.type === "board" ? "boards" : "folders";
      const response = await fetch(`/api/${collection}/${action.target.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action.body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not undo the previous action.");
    }
    await Promise.all([loadBoards(), loadFolders(), loadItems(), showTrash ? loadTrash() : Promise.resolve()]);
  }, [loadBoards, loadFolders, loadItems, loadTrash, showTrash]);

  const undoLastAction = useCallback(async () => {
    const action = undoStack[0];
    if (!action || undoBusy) return;
    setUndoBusy(true);
    setUndoStack((current) => current.slice(1));
    try {
      await executeUndoAction(action);
      notify(`Undid: ${action.label}.`);
    } catch (error) {
      setUndoStack([action]);
      notify(error instanceof Error ? error.message : "Undo failed.", true);
    } finally {
      setUndoBusy(false);
    }
  }, [executeUndoAction, notify, undoBusy, undoStack]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([loadBoards(), loadFolders()]).catch((error) => notify(error instanceof Error ? error.message : "Could not load the vault tree.", true));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadBoards, loadFolders, notify]);

  useEffect(() => {
    if (!folderTreeLoaded) return;
    window.localStorage.setItem("canvas-v4-expanded-folders", JSON.stringify([...expandedFolders]));
  }, [expandedFolders, folderTreeLoaded]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem("canvas-v4-sidebar-open");
      if (saved !== null) setSidebarOpen(saved === "true");
      setSidebarPreferenceLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!sidebarPreferenceLoaded) return;
    window.localStorage.setItem("canvas-v4-sidebar-open", String(sidebarOpen));
  }, [sidebarOpen, sidebarPreferenceLoaded]);

  useEffect(() => {
    function closeMenus() { setContextMenu(null); setItemMenu(null); setCreateMenu(null); }
    function handleKeyboard(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        closeMenus();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (event.key === "Escape") { closeMenus(); setNavigationDialog(null); setHowToUseOpen(false); }
    }
    window.addEventListener("click", closeMenus);
    window.addEventListener("keydown", handleKeyboard);
    return () => {
      if (itemClickTimer.current) window.clearTimeout(itemClickTimer.current);
      window.removeEventListener("click", closeMenus);
      window.removeEventListener("keydown", handleKeyboard);
    };
  }, []);

  useEffect(() => {
    function handleUndoShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.key.toLowerCase() !== "z" || target?.closest("input, textarea, [contenteditable='true']")) return;
      event.preventDefault();
      void undoLastAction();
    }
    window.addEventListener("keydown", handleUndoShortcut);
    return () => window.removeEventListener("keydown", handleUndoShortcut);
  }, [undoLastAction]);

  useEffect(() => {
    function handleSidebarShortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "b") return;
      event.preventDefault();
      setSidebarOpen((current) => !current);
    }
    window.addEventListener("keydown", handleSidebarShortcut);
    return () => window.removeEventListener("keydown", handleSidebarShortcut);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedIds(new Set());
      setPanelMode(null);
      void loadItems();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentBoardId, loadItems]);

  const saveText = useCallback(async (text: string) => {
    const urls = urlsFromText(text);
    const itemIds: string[] = [];
    if (urls.length) {
      for (const url of urls.slice(0, 20)) {
        const response = await fetch("/api/items", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, boardId: currentBoardId }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (data.item?.id) itemIds.push(data.item.id);
      }
      notify(`${Math.min(urls.length, 20)} link${urls.length === 1 ? "" : "s"} added to the board.`);
      return itemIds;
    }
    const response = await fetch("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "note", title: titleForPlainText(text), body: text, boardId: currentBoardId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    notify("Pasted note added to the board.");
    return data.item?.id ? [data.item.id] : [];
  }, [currentBoardId, notify]);

  const uploadFiles = useCallback(async (files: File[]) => {
    const itemIds: string[] = [];
    for (const file of files.slice(0, 30)) {
      const form = new FormData();
      form.append("file", file);
      form.append("boardId", currentBoardId);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.item?.id) itemIds.push(data.item.id);
    }
    notify(`${Math.min(files.length, 30)} file${files.length === 1 ? "" : "s"} added to the board.`);
    return itemIds;
  }, [currentBoardId, notify]);

  const ingest = useCallback(async (action: () => Promise<string[]>) => {
    if (busy) return;
    setBusy(true);
    try {
      const itemIds = await action();
      await Promise.all([loadItems(), loadBoards()]);
      if (itemIds.length) recordUndo({
        kind: "trash",
        label: `added ${itemIds.length} source${itemIds.length === 1 ? "" : "s"}`,
        targets: itemIds.map((id) => ({ type: "item", id })),
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "This item could not be added.", true);
    } finally {
      setBusy(false);
    }
  }, [busy, loadBoards, loadItems, notify, recordUndo]);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      const files = Array.from(event.clipboardData?.files || []);
      const text = event.clipboardData?.getData("text/plain").trim() || "";
      if (!files.length && !text) return;
      event.preventDefault();
      void ingest(() => files.length ? uploadFiles(files) : saveText(text));
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [ingest, saveText, uploadFiles]);

  async function createNewBoard(name: string, folderId: string | null = null) {
    const response = await fetch("/api/boards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, folderId }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not create the board.");
    if (folderId) setExpandedFolders((current) => new Set(current).add(folderId));
    await Promise.all([loadBoards(), loadFolders()]);
    setCurrentBoardId(data.board.id);
    recordUndo({ kind: "trash", label: `created board “${data.board.name}”`, targets: [{ type: "board", id: data.board.id }] });
    notify(`Board “${data.board.name}” created.`);
  }

  async function createNewFolder(name: string, parentId: string | null = null) {
    const response = await fetch("/api/folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, parentId }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not create the folder.");
    if (parentId) setExpandedFolders((current) => new Set(current).add(parentId));
    await loadFolders();
    recordUndo({ kind: "trash", label: `created folder “${data.folder.name}”`, targets: [{ type: "folder", id: data.folder.id }] });
    notify(`Folder “${data.folder.name}” created.`);
  }

  async function patchNavigation(target: NavigationTarget, body: Record<string, unknown>) {
    const response = await fetch(`/api/${target.type === "board" ? "boards" : "folders"}/${target.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Could not update the ${target.type}.`);
    await Promise.all([loadBoards(), loadFolders()]);
  }

  async function renameNavigation(target: NavigationTarget, name: string) {
    const previousName = target.type === "board" ? boards.find((board) => board.id === target.id)?.name : folders.find((folder) => folder.id === target.id)?.name;
    await patchNavigation(target, { name });
    if (previousName) recordUndo({ kind: "patch", label: `renamed ${target.type}`, target, body: { name: previousName } });
    notify(`${target.type === "board" ? "Board" : "Folder"} renamed.`);
  }

  async function moveNavigation(target: NavigationTarget, destinationId: string) {
    const destination = folders.find((folder) => folder.id === destinationId) || null;
    const previousDestinationId = target.type === "board"
      ? boards.find((board) => board.id === target.id)?.folder_id || null
      : folders.find((folder) => folder.id === target.id)?.parent_id || null;
    await patchNavigation(target, target.type === "board" ? { folderId: destination?.id || null } : { parentId: destination?.id || null });
    if (destination) setExpandedFolders((current) => new Set(current).add(destination.id));
    recordUndo({
      kind: "patch",
      label: `moved ${target.type}`,
      target,
      body: target.type === "board" ? { folderId: previousDestinationId } : { parentId: previousDestinationId },
    });
    notify(`${target.type === "board" ? "Board" : "Folder"} moved.`);
  }

  async function submitNavigationDialog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dialog = navigationDialog;
    if (!dialog || dialogBusy) return;
    if (dialog.kind !== "move" && !dialog.value.trim()) return;
    setDialogBusy(true);
    try {
      if (dialog.kind === "create-board") await createNewBoard(dialog.value.trim(), dialog.folderId);
      if (dialog.kind === "create-folder") await createNewFolder(dialog.value.trim(), dialog.parentId);
      if (dialog.kind === "rename") await renameNavigation(dialog.target, dialog.value.trim());
      if (dialog.kind === "move") await moveNavigation(dialog.target, dialog.destinationId);
      setNavigationDialog(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not update the library.", true);
    } finally {
      setDialogBusy(false);
    }
  }

  async function trashNavigation(target: NavigationTarget) {
    const response = await fetch(`/api/${target.type === "board" ? "boards" : "folders"}/${target.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) return notify(data.error || `Could not trash the ${target.type}.`, true);
    await Promise.all([loadBoards(), loadFolders()]);
    recordUndo({ kind: "restore", label: `moved ${target.type} to Trash`, targets: [target] });
    notify(`${target.type === "board" ? "Board" : "Folder"} moved to Trash.`);
  }

  async function openTrash() {
    setShowTrash(true);
    setPanelMode(null);
    setSelectedIds(new Set());
    try { await loadTrash(); } catch (error) { notify(error instanceof Error ? error.message : "Could not load Trash.", true); }
  }

  async function restoreEntry(type: NavigationTarget["type"] | "item", id: string) {
    const response = await fetch("/api/trash/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, id }) });
    const data = await response.json();
    if (!response.ok) return notify(data.error || "Restore failed.", true);
    await Promise.all([loadTrash(), loadBoards(), loadFolders()]);
    recordUndo({ kind: "trash", label: `restored ${type}`, targets: [{ type, id }] });
    notify("Restored to the vault.");
  }

  async function permanentlyDeleteEntry(type: NavigationTarget["type"] | "item", entry: TrashEntry) {
    const response = await fetch(`/api/trash/${type}/${entry.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) return notify(data.error || "Permanent deletion failed.", true);
    await loadTrash();
    notify("Permanently deleted.");
  }

  async function emptyTrashNow() {
    const count = trash.folders.length + trash.boards.length + trash.items.length;
    if (!count) return;
    const response = await fetch("/api/trash", { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) return notify(data.error || "Could not empty Trash.", true);
    await loadTrash();
    notify("Trash emptied.");
  }

  function toggleFolder(id: string) {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openContextMenu(event: React.MouseEvent, target: NavigationTarget) {
    event.preventDefault();
    event.stopPropagation();
    setCreateMenu(null);
    setItemMenu(null);
    setContextMenu({ ...target, x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 220) });
  }

  function openItemMenu(event: React.MouseEvent, item: ContentItem) {
    event.preventDefault();
    event.stopPropagation();
    if (itemClickTimer.current) window.clearTimeout(itemClickTimer.current);
    itemClickTimer.current = null;
    setCreateMenu(null);
    setContextMenu(null);
    setItemMenu({ id: item.id, x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 76) });
  }

  function toggleCreateMenu(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
    setItemMenu(null);
    const rect = event.currentTarget.getBoundingClientRect();
    setCreateMenu((current) => current ? null : {
      left: Math.max(8, Math.min(rect.right - 180, window.innerWidth - 188)),
      top: Math.min(rect.bottom + 6, window.innerHeight - 84),
    });
  }

  function openItem(item: ContentItem, additive = false) {
    setActiveItemId(item.id);
    setPanelMode("detail");
    setSelectedIds((current) => {
      if (!additive) return new Set([item.id]);
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
      return next;
    });
  }

  function handleItemClick(event: React.MouseEvent, item: ContentItem) {
    if (event.detail > 1) return;
    const additive = event.metaKey || event.ctrlKey;
    if (itemClickTimer.current) window.clearTimeout(itemClickTimer.current);
    itemClickTimer.current = window.setTimeout(() => {
      openItem(item, additive);
      itemClickTimer.current = null;
    }, 220);
  }

  function toggleSelection(item: ContentItem) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
      return next;
    });
  }

  function moveActive(direction: number) {
    if (!activeItem) return;
    const index = items.findIndex((item) => item.id === activeItem.id);
    const next = items[(index + direction + items.length) % items.length];
    if (next) {
      setActiveItemId(next.id);
      setSelectedIds(new Set([next.id]));
    }
  }

  async function fetchTranscript(item: ContentItem) {
    setBusy(true);
    try {
      const response = await fetch(`/api/items/${item.id}/transcript`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setItems((current) => current.map((entry) => entry.id === item.id ? data.item : entry));
      notify(data.item.transcript_origin === "source_caption" ? "Source captions saved locally." : "Local transcript saved.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Transcript failed.", true);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelection() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBusy(true);
    try {
      for (const id of ids) {
        const response = await fetch(`/api/items/${id}`, { method: "DELETE" });
        if (!response.ok) throw new Error("An item could not be deleted.");
      }
      setSelectedIds(new Set());
      setPanelMode(null);
      await Promise.all([loadItems(), loadBoards()]);
      recordUndo({ kind: "restore", label: `moved ${ids.length} source${ids.length === 1 ? "" : "s"} to Trash`, targets: ids.map((id) => ({ type: "item", id })) });
      notify("Selection moved to Trash.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Delete failed.", true);
    } finally {
      setBusy(false);
    }
  }

  async function deleteItemFromMenu(id: string) {
    setItemMenu(null);
    setSelectedIds(new Set([id]));
    setBusy(true);
    try {
      const response = await fetch(`/api/items/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "This source could not be moved to Trash.");
      setSelectedIds(new Set());
      if (activeItemId === id) {
        setActiveItemId(null);
        setPanelMode(null);
      }
      await Promise.all([loadItems(), loadBoards()]);
      recordUndo({ kind: "restore", label: "moved source to Trash", targets: [{ type: "item", id }] });
      notify("Source moved to Trash.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Delete failed.", true);
    } finally {
      setBusy(false);
    }
  }

  async function openHowToUse() {
    setHowToUseOpen(true);
    if (workspaceDir) return;
    try {
      const response = await fetch("/api/workspace", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (typeof data.workspaceDir === "string") setWorkspaceDir(data.workspaceDir);
    } catch {
      // The guide still works with the documented default path.
    }
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragActive(false);
    const files = Array.from(event.dataTransfer.files);
    const text = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    if (files.length) void ingest(() => uploadFiles(files));
    else if (text.trim()) void ingest(() => saveText(text.trim()));
  }

  const navigationDialogTitle = navigationDialog?.kind === "create-board" ? "Create a new board" : navigationDialog?.kind === "create-folder" ? "Create a new folder" : navigationDialog?.kind === "rename" ? `Rename ${navigationDialog.target.type}` : "Move to a folder";
  const navigationDialogAction = navigationDialog?.kind === "rename" ? "Rename" : navigationDialog?.kind === "move" ? "Move" : "Create";

  function boardRow(board: Board, depth: number) {
    return <div key={board.id} className={`tree-row board-tree-row ${currentBoardId === board.id ? "active" : ""}`} style={{ "--tree-depth": depth } as React.CSSProperties} onContextMenu={(event) => openContextMenu(event, { type: "board", id: board.id })}>
      <button className="tree-main" onClick={() => { setShowTrash(false); setCurrentBoardId(board.id); }}><Grid2X2 size={13} /><span>{board.name}</span><small>{board.item_count}</small></button>
      <button className="tree-more" aria-label={`Actions for ${board.name}`} onClick={(event) => openContextMenu(event, { type: "board", id: board.id })}><MoreHorizontal size={14} /></button>
    </div>;
  }

  function folderBranch(folder: VaultFolder, depth: number): React.ReactNode {
    const open = expandedFolders.has(folder.id);
    const children = folders.filter((entry) => entry.parent_id === folder.id);
    const folderBoards = boards.filter((board) => board.folder_id === folder.id);
    return <div key={folder.id} className="tree-branch">
      <div className="tree-row folder-tree-row" style={{ "--tree-depth": depth } as React.CSSProperties} onContextMenu={(event) => openContextMenu(event, { type: "folder", id: folder.id })} onDoubleClick={() => toggleFolder(folder.id)}>
        <button className="tree-main" onClick={() => toggleFolder(folder.id)}>{open ? <ChevronDown className="tree-chevron" size={12} /> : <ChevronRight className="tree-chevron" size={12} />}{open ? <FolderOpen size={14} /> : <Folder size={14} />}<span>{folder.name}</span><small>{folder.board_count}</small></button>
        <button className="tree-more" aria-label={`Actions for ${folder.name}`} onClick={(event) => openContextMenu(event, { type: "folder", id: folder.id })}><MoreHorizontal size={14} /></button>
      </div>
      {open && <div className="tree-children">{children.map((child) => folderBranch(child, depth + 1))}{folderBoards.map((board) => boardRow(board, depth + 1))}{!children.length && !folderBoards.length && <div className="tree-folder-empty" style={{ "--tree-depth": depth + 1 } as React.CSSProperties}>Empty folder</div>}</div>}
    </div>;
  }

  return (
    <div className={`vault-shell ${panelMode ? "has-pane" : ""} ${sidebarOpen ? "" : "sidebar-hidden"}`}>
      <aside className="sidebar" aria-hidden={!sidebarOpen}>
        <div className="brand"><span className="brand-mark"><Sparkles size={15} /></span><strong>Canvas Vault</strong><button className="sidebar-hide-toggle" onClick={() => setSidebarOpen(false)} aria-label="Hide sidebar" title="Hide sidebar (⌘B)"><PanelLeftClose size={15} /></button></div>
        <div className="sidebar-search"><Search size={14} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Create or search" aria-label="Search this board" /><kbd>⌘K</kbd></div>

        <nav className="side-section boards-section">
          <div className="side-title"><span>Library</span><div className="create-navigation"><button aria-label="Create board or folder" aria-expanded={Boolean(createMenu)} onClick={toggleCreateMenu}><Plus size={13} /></button></div></div>
          <div className="vault-tree">
            {folders.filter((folder) => !folder.parent_id).map((folder) => folderBranch(folder, 0))}
            {boards.filter((board) => !board.folder_id).map((board) => boardRow(board, 0))}
          </div>
        </nav>

        <button className="sidebar-undo" onClick={() => void undoLastAction()} disabled={!undoStack.length || undoBusy} title={undoStack[0]?.label || "Nothing to undo"}><Undo2 className={undoBusy ? "spin" : ""} size={13} /><span>Undo</span><kbd>⌘Z</kbd></button>
        <button className="sidebar-guide" onClick={() => void openHowToUse()}><BookOpen size={13} /><span>Use with Codex</span></button>
        <button className={`sidebar-trash ${showTrash ? "active" : ""}`} onClick={() => void openTrash()}><Trash2 size={13} /><span>Trash</span><small>{trash.folders.length + trash.boards.length + trash.items.length || ""}</small></button>
        <div className="sidebar-foot"><Database size={13} /><span><strong>Personal library</strong>Files stay on this Mac</span></div>
      </aside>

      <main className="board-main" onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }} onDrop={handleDrop}>
        {!sidebarOpen && <button className="sidebar-show-toggle" onClick={() => setSidebarOpen(true)} aria-label="Show sidebar" title="Show sidebar (⌘B)"><PanelLeftOpen size={15} /><span>Show sidebar</span></button>}
        {showTrash ? <>
          <header className="board-header trash-header"><div><p>Recoverable storage</p><h1>Trash</h1></div><button className="empty-trash-button" onClick={() => void emptyTrashNow()} disabled={!trash.folders.length && !trash.boards.length && !trash.items.length}><Trash2 size={14} />Empty Trash</button></header>
          <section className="trash-view">
            {!trash.folders.length && !trash.boards.length && !trash.items.length ? <div className="trash-empty"><Trash2 size={25} /><h2>Trash is empty</h2><p>Deleted folders, boards, and sources remain recoverable here until you permanently remove them.</p></div> : <>
              {(["folder", "board", "item"] as const).map((type) => {
                const entries = type === "folder" ? trash.folders : type === "board" ? trash.boards : trash.items;
                if (!entries.length) return null;
                return <section className="trash-group" key={type}><h2>{type === "folder" ? "Folders" : type === "board" ? "Boards" : "Sources"}</h2><div className="trash-list">{entries.map((entry) => <article key={`${type}-${entry.id}`}><div className="trash-kind">{type === "folder" ? <Folder size={15} /> : type === "board" ? <Grid2X2 size={15} /> : <File size={15} />}</div><div><strong>{entry.name || entry.title}</strong><span>{type === "item" ? `${entry.source_type || "source"} · ${entry.board_name || "board"}` : type === "board" ? `${entry.item_count || 0} sources${entry.folder_name ? ` · ${entry.folder_name}` : ""}` : `${entry.board_count || 0} direct boards`}</span></div><div className="trash-actions"><button onClick={() => void restoreEntry(type, entry.id)}><RotateCcw size={13} />Restore</button><button className="danger" onClick={() => void permanentlyDeleteEntry(type, entry)}><Trash2 size={13} />Delete forever</button></div></article>)}</div></section>;
              })}
            </>}
          </section>
        </> : <>
        <header className="board-header">
          <div><p>Private board</p><h1>{currentBoard?.name || "My Library"}</h1></div>
          <div className="board-actions">
            <span className="paste-hint"><kbd>⌘V</kbd> paste · drop anywhere</span>
            <div className="view-switch"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Grid view"><Grid2X2 size={15} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="List view"><Rows3 size={15} /></button></div>
          </div>
        </header>

        <section className={`board-canvas ${dragActive ? "drag-active" : ""}`}>
          {dragActive && <div className="drop-layer"><Plus size={28} /><strong>Drop into {currentBoard?.name}</strong></div>}
          {busy && <div className="ingest-status"><LoaderCircle className="spin" size={14} /> Adding to board…</div>}
          {!loading && !filteredItems.length ? (
            <div className="canvas-empty"><div className="empty-mark"><Plus size={22} /></div><h2>Paste anything here</h2><p>Copy a link, image, PDF, video, or text, then press <kbd>⌘V</kbd>. You can also drop files anywhere on this board.</p></div>
          ) : (
            <div className={`source-layout ${view}`}>
              {filteredItems.map((item) => {
                const preview = previewUrl(item);
                const checked = selectedIds.has(item.id);
                const textPreview = item.content_text || item.description || "";
                const orientation = youtubeOrientation(item);
                const videoDuration = item.source_type === "youtube" ? durationLabel(item.duration_seconds) : null;
                return <article
                  key={item.id}
                  className={`source-card ${checked ? "selected" : ""} ${preview ? "visual" : "textual"} ${item.source_type === "document" ? "document" : ""} ${orientation ? `youtube youtube-${orientation}` : ""}`}
                  title="Double-click for actions"
                  onClick={(event) => handleItemClick(event, item)}
                  onDoubleClick={(event) => openItemMenu(event, item)}
                  onContextMenu={(event) => openItemMenu(event, item)}
                >
                  <button className="select-control" aria-label={checked ? "Deselect source" : "Select source"} onClick={(event) => { event.stopPropagation(); toggleSelection(item); }}>{checked ? <Check size={12} /> : <span />}</button>
                  <button className="item-action-control" aria-label={`Actions for ${item.title}`} onClick={(event) => openItemMenu(event, item)}><MoreHorizontal size={14} /></button>
                  {preview ? <div className="source-preview"><img src={preview} alt="" />{videoDuration && <span className="video-duration">{videoDuration}</span>}</div> : <div className="text-preview"><span>{sourceLabel(item)}</span><h2>{item.title}</h2>{textPreview && <p>{textPreview}</p>}</div>}
                  <footer><div>{item.source_type === "youtube" ? <><strong title={item.title}>{item.title}</strong><span>{youtubeDetails(item)}</span></> : <><span>{sourceLabel(item)}</span><strong title={item.file_name || item.title}>{item.file_name || item.title}</strong></>}</div>{item.transcript_status === "ready" && <Captions size={13} />}</footer>
                </article>;
              })}
            </div>
          )}
        </section>
        </>}
      </main>

      {panelMode && <aside className="side-pane">
        {panelMode === "detail" && activeItem && <>
          <div className="pane-bar"><div className="pane-nav"><button onClick={() => moveActive(-1)} aria-label="Previous source"><ChevronLeft size={16} /></button><span>{items.findIndex((item) => item.id === activeItem.id) + 1} / {items.length}</span><button onClick={() => moveActive(1)} aria-label="Next source"><ChevronRight size={16} /></button></div><button onClick={() => setPanelMode(null)} aria-label="Close pane"><PanelRightClose size={17} /></button></div>
          <div className="detail-pane">
            {activeItem.source_type === "youtube" && youtubeEmbed(activeItem) ? <div className="pane-media"><iframe src={youtubeEmbed(activeItem)!} title={activeItem.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
              : activeItem.source_type === "video" && activeItem.file_path ? <div className="pane-media"><video src={`/api/items/${activeItem.id}/file`} controls /></div>
              : activeItem.source_type === "audio" && activeItem.file_path ? <div className="audio-player"><audio src={`/api/items/${activeItem.id}/file`} controls /></div>
              : previewUrl(activeItem) ? <div className="pane-media contain"><img src={previewUrl(activeItem)!} alt="" /></div> : null}
            <div className="pane-copy"><span className="source-kind">{sourceLabel(activeItem)}</span><h2>{activeItem.title}</h2>{activeItem.author && <p className="author">{activeItem.author}</p>}
              <div className="pane-actions">{activeItem.canonical_url && <a href={activeItem.canonical_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Original</a>}{activeItem.file_path && <a href={`/api/items/${activeItem.id}/file`} target="_blank"><File size={14} /> Open file</a>}</div>
              {(activeItem.content_text || activeItem.description) && <section className="readable-text"><h3>{activeItem.source_type === "note" ? "Note" : "Extracted text"}</h3><p>{activeItem.content_text || activeItem.description}</p></section>}
              {["youtube", "video", "audio"].includes(activeItem.source_type) && <section className="readable-text"><h3>Transcript</h3>{activeItem.transcript_status === "ready" && activeItem.transcript_text ? <p>{activeItem.transcript_text}</p> : <div className="transcript-prompt"><p>{activeItem.transcript_status === "failed" ? activeItem.transcript_error : "Fetch this only when you need the spoken text."}</p><button disabled={busy} onClick={() => void fetchTranscript(activeItem)}>{busy ? <LoaderCircle className="spin" size={13} /> : <Captions size={13} />} {activeItem.transcript_status === "failed" ? "Try again" : "Fetch transcript"}</button></div>}</section>}
            </div>
          </div>
        </>}

      </aside>}

      {selectedIds.size > 0 && <div className="selection-bar"><span>{selectedIds.size} selected</span><button onClick={() => void deleteSelection()}><Trash2 size={14} /> Delete</button><button className="clear" onClick={() => setSelectedIds(new Set())}><X size={14} /></button></div>}
      {createMenu && <div className="navigation-menu create-navigation-menu" style={createMenu} onClick={(event) => event.stopPropagation()}>
        <button onClick={() => { setCreateMenu(null); setNavigationDialog({ kind: "create-board", folderId: null, value: "" }); }}><Grid2X2 size={14} />New board</button>
        <button onClick={() => { setCreateMenu(null); setNavigationDialog({ kind: "create-folder", parentId: null, value: "" }); }}><FolderPlus size={14} />New folder</button>
      </div>}
      {contextMenu && <div className="navigation-menu context-navigation-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
        {contextMenu.type === "folder" && <><button onClick={() => { const folderId = contextMenu.id; setContextMenu(null); setNavigationDialog({ kind: "create-board", folderId, value: "" }); }}><Grid2X2 size={14} />New board here</button><button onClick={() => { const parentId = contextMenu.id; setContextMenu(null); setNavigationDialog({ kind: "create-folder", parentId, value: "" }); }}><FolderPlus size={14} />New subfolder</button><span className="menu-separator" /></>}
        <button onClick={() => { const target = contextMenu; const value = target.type === "board" ? boards.find((board) => board.id === target.id)?.name || "" : folders.find((folder) => folder.id === target.id)?.name || ""; setContextMenu(null); setNavigationDialog({ kind: "rename", target, value }); }}><Pencil size={14} />Rename</button>
        <button onClick={() => { const target = contextMenu; const destinationId = target.type === "board" ? boards.find((board) => board.id === target.id)?.folder_id || "" : folders.find((folder) => folder.id === target.id)?.parent_id || ""; setContextMenu(null); setNavigationDialog({ kind: "move", target, destinationId }); }}><FolderOpen size={14} />Move to folder…</button>
        <span className="menu-separator" />
        <button className="danger" onClick={() => { const target = contextMenu; setContextMenu(null); void trashNavigation(target); }}><Trash2 size={14} />Move to Trash</button>
      </div>}
      {itemMenu && <div className="navigation-menu item-navigation-menu" style={{ left: itemMenu.x, top: itemMenu.y }} onClick={(event) => event.stopPropagation()}>
        <button className="danger" onClick={() => void deleteItemFromMenu(itemMenu.id)}><Trash2 size={14} />Move to Trash</button>
      </div>}
      {navigationDialog && <div className="navigation-dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !dialogBusy) setNavigationDialog(null); }}>
        <form className="navigation-dialog" onSubmit={submitNavigationDialog}>
          <div className="navigation-dialog-heading"><div><span>Library</span><h2>{navigationDialogTitle}</h2></div><button type="button" aria-label="Close" onClick={() => setNavigationDialog(null)} disabled={dialogBusy}><X size={16} /></button></div>
          {navigationDialog.kind === "move" ? <label><span>Destination</span><select autoFocus value={navigationDialog.destinationId} onChange={(event) => setNavigationDialog((current) => current?.kind === "move" ? { ...current, destinationId: event.target.value } : current)}><option value="">Top level</option>{folders.filter((folder) => folder.id !== navigationDialog.target.id).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label> : <label><span>Name</span><input autoFocus maxLength={120} value={navigationDialog.value} onChange={(event) => setNavigationDialog((current) => current && current.kind !== "move" ? { ...current, value: event.target.value } : current)} placeholder={navigationDialog.kind === "create-board" ? "Board name" : navigationDialog.kind === "create-folder" ? "Folder name" : "New name"} /></label>}
          <div className="navigation-dialog-actions"><button type="button" onClick={() => setNavigationDialog(null)} disabled={dialogBusy}>Cancel</button><button className="primary" disabled={dialogBusy || (navigationDialog.kind !== "move" && !navigationDialog.value.trim())}>{dialogBusy ? "Saving…" : navigationDialogAction}</button></div>
        </form>
      </div>}
      {howToUseOpen && <div className="navigation-dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setHowToUseOpen(false); }}>
        <section className="how-to-dialog" role="dialog" aria-modal="true" aria-labelledby="how-to-title">
          <div className="navigation-dialog-heading"><div><span>Canvas Vault</span><h2 id="how-to-title">Use Canvas Workspace with Codex</h2></div><button type="button" aria-label="Close" onClick={() => setHowToUseOpen(false)}><X size={16} /></button></div>
          <p className="how-to-intro">Canvas Vault stores and organizes your material. The thinking, writing, and specialist tools live in Codex.</p>
          <ol className="how-to-steps">
            <li><span>1</span><div><strong>Open the Canvas Workspace in Codex</strong><p>In Codex, choose <em>Open folder</em> and select this generated workspace:</p><code>{workspaceDir || "~/Documents/Canvas Workspace"}</code></div></li>
            <li><span>2</span><div><strong>Choose the relevant folder or board</strong><p>Tell Codex which material to read. Your saved files, extracted text, and transcripts stay together in the library.</p></div></li>
            <li><span>3</span><div><strong>Use any Codex skill or agent</strong><p>Write, research, brainstorm, or create outputs with the files as context. Canvas Vault does not contain bots or a chat mode.</p></div></li>
          </ol>
          <p className="how-to-note">The guide refreshes the workspace before showing it. You can also choose <strong>Canvas Vault → Open Canvas Workspace</strong> from the desktop app menu.</p>
        </section>
      </div>}
      {toast && <div className={`toast ${toast.error ? "error" : ""}`}>{toast.text}</div>}
    </div>
  );
}
