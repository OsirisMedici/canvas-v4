"use client";

/* Saved sources can use arbitrary remote thumbnail hosts. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Captions, Check, ChevronDown, ChevronLeft, ChevronRight, Database, ExternalLink,
  File, Folder, FolderOpen, FolderPlus, Grid2X2, Link2, LoaderCircle,
  MessageSquare, MoreHorizontal, PanelRightClose, Pencil, Plus, Rows3,
  RotateCcw, Search, Send, Sparkles, Trash2, X,
} from "lucide-react";
import type { Board, ChatMessage, ContentItem, Folder as VaultFolder } from "@/lib/types";

type PanelMode = "detail" | "chat";
type ViewMode = "grid" | "list";
type ChatSession = {
  id: string;
  board_id: string;
  title: string;
  scope_type: "board" | "selection";
  source_item_ids: string[];
  created_at: string;
  updated_at: string;
};
type NavigationTarget = { type: "board" | "folder"; id: string };
type ContextMenuState = NavigationTarget & { x: number; y: number };
type MenuPosition = { left: number; top: number };
type NavigationDialog =
  | { kind: "create-board"; folderId: string | null; value: string }
  | { kind: "create-folder"; parentId: string | null; value: string }
  | { kind: "rename"; target: NavigationTarget; value: string }
  | { kind: "move"; target: NavigationTarget; destinationId: string };
type TrashEntry = { id: string; name?: string; title?: string; source_type?: string; board_name?: string; folder_name?: string; item_count?: number; board_count?: number; trashed_at: string };
type TrashData = { folders: TrashEntry[]; boards: TrashEntry[]; items: TrashEntry[] };

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
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatScopeIds, setChatScopeIds] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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
      const saved = window.localStorage.getItem("osiris-vault-expanded-folders");
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

  const loadChats = useCallback(async () => {
    try {
      const response = await fetch(`/api/chats?board=${encodeURIComponent(currentBoardId)}`, { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setChats(data.chats);
    } catch {
      // The board remains usable if chat history cannot load.
    }
  }, [currentBoardId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([loadBoards(), loadFolders()]).catch((error) => notify(error instanceof Error ? error.message : "Could not load the vault tree.", true));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadBoards, loadFolders, notify]);

  useEffect(() => {
    if (!folderTreeLoaded) return;
    window.localStorage.setItem("osiris-vault-expanded-folders", JSON.stringify([...expandedFolders]));
  }, [expandedFolders, folderTreeLoaded]);

  useEffect(() => {
    function closeMenus() { setContextMenu(null); setCreateMenu(null); }
    function handleKeyboard(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        closeMenus();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (event.key === "Escape") { closeMenus(); setNavigationDialog(null); }
    }
    window.addEventListener("click", closeMenus);
    window.addEventListener("keydown", handleKeyboard);
    return () => { window.removeEventListener("click", closeMenus); window.removeEventListener("keydown", handleKeyboard); };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedIds(new Set());
      setPanelMode(null);
      setActiveSessionId(null);
      setChatMessages([]);
      void Promise.all([loadItems(), loadChats()]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentBoardId, loadChats, loadItems]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages, chatBusy]);

  const saveText = useCallback(async (text: string) => {
    const urls = urlsFromText(text);
    if (urls.length) {
      for (const url of urls.slice(0, 20)) {
        const response = await fetch("/api/items", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, boardId: currentBoardId }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
      }
      notify(`${Math.min(urls.length, 20)} link${urls.length === 1 ? "" : "s"} added to the board.`);
      return;
    }
    const response = await fetch("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "note", title: titleForPlainText(text), body: text, boardId: currentBoardId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    notify("Pasted note added to the board.");
  }, [currentBoardId, notify]);

  const uploadFiles = useCallback(async (files: File[]) => {
    for (const file of files.slice(0, 30)) {
      const form = new FormData();
      form.append("file", file);
      form.append("boardId", currentBoardId);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
    }
    notify(`${Math.min(files.length, 30)} file${files.length === 1 ? "" : "s"} added to the board.`);
  }, [currentBoardId, notify]);

  const ingest = useCallback(async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await Promise.all([loadItems(), loadBoards()]);
    } catch (error) {
      notify(error instanceof Error ? error.message : "This item could not be added.", true);
    } finally {
      setBusy(false);
    }
  }, [busy, loadBoards, loadItems, notify]);

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
    notify(`Board “${data.board.name}” created.`);
  }

  async function createNewFolder(name: string, parentId: string | null = null) {
    const response = await fetch("/api/folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, parentId }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not create the folder.");
    if (parentId) setExpandedFolders((current) => new Set(current).add(parentId));
    await loadFolders();
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
    await patchNavigation(target, { name });
    notify(`${target.type === "board" ? "Board" : "Folder"} renamed.`);
  }

  async function moveNavigation(target: NavigationTarget, destinationId: string) {
    const destination = folders.find((folder) => folder.id === destinationId) || null;
    await patchNavigation(target, target.type === "board" ? { folderId: destination?.id || null } : { parentId: destination?.id || null });
    if (destination) setExpandedFolders((current) => new Set(current).add(destination.id));
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
    const name = target.type === "board" ? boards.find((board) => board.id === target.id)?.name : folders.find((folder) => folder.id === target.id)?.name;
    const detail = target.type === "folder" ? " Its nested folders and boards will also move to Trash. Stored files will remain untouched." : " Its stored sources and files will remain untouched.";
    if (!window.confirm(`Move “${name || target.type}” to Trash?${detail}`)) return;
    const response = await fetch(`/api/${target.type === "board" ? "boards" : "folders"}/${target.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) return notify(data.error || `Could not trash the ${target.type}.`, true);
    await Promise.all([loadBoards(), loadFolders()]);
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
    notify("Restored to the vault.");
  }

  async function permanentlyDeleteEntry(type: NavigationTarget["type"] | "item", entry: TrashEntry) {
    const label = entry.name || entry.title || type;
    if (!window.confirm(`Permanently delete “${label}”? This removes its database record and local files and cannot be undone.`)) return;
    const response = await fetch(`/api/trash/${type}/${entry.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) return notify(data.error || "Permanent deletion failed.", true);
    await loadTrash();
    notify("Permanently deleted.");
  }

  async function emptyTrashNow() {
    const count = trash.folders.length + trash.boards.length + trash.items.length;
    if (!count || !window.confirm(`Permanently delete all ${count} entries in Trash? This cannot be undone.`)) return;
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
    setContextMenu({ ...target, x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 220) });
  }

  function toggleCreateMenu(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
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
    if (!ids.length || !window.confirm(`Move ${ids.length} selected item${ids.length === 1 ? "" : "s"} to Trash? Local files will remain recoverable.`)) return;
    setBusy(true);
    try {
      for (const id of ids) {
        const response = await fetch(`/api/items/${id}`, { method: "DELETE" });
        if (!response.ok) throw new Error("An item could not be deleted.");
      }
      setSelectedIds(new Set());
      setPanelMode(null);
      await Promise.all([loadItems(), loadBoards()]);
      notify("Selection moved to Trash.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Delete failed.", true);
    } finally {
      setBusy(false);
    }
  }

  function startChat(ids: string[]) {
    setChatScopeIds(ids);
    setChatMessages([]);
    setActiveSessionId(null);
    setPanelMode("chat");
    window.setTimeout(() => document.querySelector<HTMLInputElement>(".chat-input")?.focus(), 80);
  }

  async function openChat(session: ChatSession) {
    setPanelMode("chat");
    setActiveSessionId(session.id);
    setChatScopeIds(session.source_item_ids || []);
    setChatMessages([]);
    const response = await fetch(`/api/chats/${session.id}`, { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setChatMessages(data.messages);
  }

  async function sendChat(event: React.FormEvent) {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || chatBusy) return;
    setChatInput("");
    const optimistic: ChatMessage = { id: `local-${Date.now()}`, session_id: activeSessionId || "", role: "user", content: message, created_at: new Date().toISOString() };
    setChatMessages((current) => [...current, optimistic]);
    setChatBusy(true);
    try {
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardId: currentBoardId, itemIds: chatScopeIds, message, sessionId: activeSessionId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setActiveSessionId(data.session.id);
      setChatMessages((current) => [...current, data.message]);
      await loadChats();
    } catch (error) {
      notify(error instanceof Error ? error.message : "The local agent could not answer.", true);
      setChatMessages((current) => current.filter((entry) => entry.id !== optimistic.id));
      setChatInput(message);
    } finally {
      setChatBusy(false);
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

  const scopeItems = chatScopeIds.map((id) => items.find((item) => item.id === id)).filter(Boolean) as ContentItem[];
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
    <div className={`vault-shell ${panelMode ? "has-pane" : ""}`}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Sparkles size={15} /></span><strong>Osiris Vault</strong></div>
        <div className="sidebar-search"><Search size={14} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Create or search" aria-label="Search this board" /><kbd>⌘K</kbd></div>

        <nav className="side-section">
          <div className="side-title"><span>Chats</span></div>
          <div className="side-list chat-list">
            {chats.slice(0, 6).map((chat) => <button key={chat.id} className={activeSessionId === chat.id ? "active" : ""} onClick={() => void openChat(chat)}><span className="dot" /> <span>{chat.title}</span></button>)}
            {!chats.length && <div className="side-empty">Chats with sources appear here</div>}
          </div>
        </nav>

        <nav className="side-section boards-section">
          <div className="side-title"><span>Library</span><div className="create-navigation"><button aria-label="Create board or folder" aria-expanded={Boolean(createMenu)} onClick={toggleCreateMenu}><Plus size={13} /></button></div></div>
          <div className="vault-tree">
            {folders.filter((folder) => !folder.parent_id).map((folder) => folderBranch(folder, 0))}
            {boards.filter((board) => !board.folder_id).map((board) => boardRow(board, 0))}
          </div>
        </nav>

        <button className={`sidebar-trash ${showTrash ? "active" : ""}`} onClick={() => void openTrash()}><Trash2 size={13} /><span>Trash</span><small>{trash.folders.length + trash.boards.length + trash.items.length || ""}</small></button>
        <div className="sidebar-foot"><Database size={13} /><span><strong>Local vault</strong>Your Mac is the server</span></div>
      </aside>

      <main className="board-main" onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }} onDrop={handleDrop}>
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
            <button className="chat-board-button" onClick={() => startChat([])}><MessageSquare size={14} /> Chat with board</button>
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
                return <article key={item.id} className={`source-card ${checked ? "selected" : ""} ${preview ? "visual" : "textual"} ${item.source_type === "document" ? "document" : ""}`} onClick={(event) => openItem(item, event.metaKey || event.ctrlKey)}>
                  <button className="select-control" aria-label={checked ? "Deselect source" : "Select source"} onClick={(event) => { event.stopPropagation(); toggleSelection(item); }}>{checked ? <Check size={12} /> : <span />}</button>
                  {preview ? <div className="source-preview"><img src={preview} alt="" /></div> : <div className="text-preview"><span>{sourceLabel(item)}</span><h2>{item.title}</h2>{textPreview && <p>{textPreview}</p>}</div>}
                  <footer><div><span>{sourceLabel(item)}</span><strong>{item.source_type === "youtube" ? "YouTube Video" : item.file_name || item.title}</strong></div>{item.transcript_status === "ready" && <Captions size={13} />}</footer>
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
              <div className="pane-actions"><button onClick={() => startChat([activeItem.id])}><MessageSquare size={14} /> Chat with this source</button>{activeItem.canonical_url && <a href={activeItem.canonical_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Original</a>}{activeItem.file_path && <a href={`/api/items/${activeItem.id}/file`} target="_blank"><File size={14} /> Open file</a>}</div>
              {(activeItem.content_text || activeItem.description) && <section className="readable-text"><h3>{activeItem.source_type === "note" ? "Note" : "Extracted text"}</h3><p>{activeItem.content_text || activeItem.description}</p></section>}
              {["youtube", "video", "audio"].includes(activeItem.source_type) && <section className="readable-text"><h3>Transcript</h3>{activeItem.transcript_status === "ready" && activeItem.transcript_text ? <p>{activeItem.transcript_text}</p> : <div className="transcript-prompt"><p>{activeItem.transcript_status === "failed" ? activeItem.transcript_error : "Fetch this only when you need the spoken text."}</p><button disabled={busy} onClick={() => void fetchTranscript(activeItem)}>{busy ? <LoaderCircle className="spin" size={13} /> : <Captions size={13} />} {activeItem.transcript_status === "failed" ? "Try again" : "Fetch transcript"}</button></div>}</section>}
            </div>
          </div>
        </>}

        {panelMode === "chat" && <>
          <div className="pane-bar chat-pane-bar"><div><span>New chat</span><small>Local Codex agent</small></div><button onClick={() => setPanelMode(null)} aria-label="Close chat"><X size={17} /></button></div>
          <div className="chat-body">
            <div className="chat-scope"><Sparkles size={15} /><div><span>Talking with</span><strong>{chatScopeIds.length ? `${chatScopeIds.length} selected source${chatScopeIds.length === 1 ? "" : "s"}` : currentBoard?.name}</strong></div></div>
            {scopeItems.length > 0 && <div className="scope-chips">{scopeItems.map((item) => <span key={item.id}><Link2 size={11} />{item.title}<button onClick={() => setChatScopeIds((current) => current.filter((id) => id !== item.id))}><X size={10} /></button></span>)}</div>}
            {!chatMessages.length && <div className="chat-welcome"><div className="agent-mark"><Sparkles size={22} /></div><h2>What are we making today?</h2><p>Ask for a synthesis, outline, rewrite, research note, or a direct answer grounded in these sources.</p></div>}
            <div className="messages">{chatMessages.map((message) => <div key={message.id} className={`message ${message.role}`}><span>{message.role === "assistant" ? "Agent" : "You"}</span><p>{message.content}</p></div>)}{chatBusy && <div className="message assistant thinking"><span>Agent</span><p><LoaderCircle className="spin" size={14} /> Reading your sources…</p></div>}<div ref={chatEndRef} /></div>
          </div>
          <form className="chat-composer" onSubmit={sendChat}><textarea className="chat-input" value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Ask about this board or selected sources…" /><div><span>Enter to send · Shift+Enter for a line</span><button disabled={!chatInput.trim() || chatBusy}><Send size={15} /></button></div></form>
        </>}
      </aside>}

      {selectedIds.size > 0 && panelMode !== "chat" && <div className="selection-bar"><span>{selectedIds.size} selected</span><button onClick={() => startChat([...selectedIds])}><MessageSquare size={14} /> Chat</button><button onClick={() => void deleteSelection()}><Trash2 size={14} /> Delete</button><button className="clear" onClick={() => setSelectedIds(new Set())}><X size={14} /></button></div>}
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
      {navigationDialog && <div className="navigation-dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !dialogBusy) setNavigationDialog(null); }}>
        <form className="navigation-dialog" onSubmit={submitNavigationDialog}>
          <div className="navigation-dialog-heading"><div><span>Library</span><h2>{navigationDialogTitle}</h2></div><button type="button" aria-label="Close" onClick={() => setNavigationDialog(null)} disabled={dialogBusy}><X size={16} /></button></div>
          {navigationDialog.kind === "move" ? <label><span>Destination</span><select autoFocus value={navigationDialog.destinationId} onChange={(event) => setNavigationDialog((current) => current?.kind === "move" ? { ...current, destinationId: event.target.value } : current)}><option value="">Top level</option>{folders.filter((folder) => folder.id !== navigationDialog.target.id).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label> : <label><span>Name</span><input autoFocus maxLength={120} value={navigationDialog.value} onChange={(event) => setNavigationDialog((current) => current && current.kind !== "move" ? { ...current, value: event.target.value } : current)} placeholder={navigationDialog.kind === "create-board" ? "Board name" : navigationDialog.kind === "create-folder" ? "Folder name" : "New name"} /></label>}
          <div className="navigation-dialog-actions"><button type="button" onClick={() => setNavigationDialog(null)} disabled={dialogBusy}>Cancel</button><button className="primary" disabled={dialogBusy || (navigationDialog.kind !== "move" && !navigationDialog.value.trim())}>{dialogBusy ? "Saving…" : navigationDialogAction}</button></div>
        </form>
      </div>}
      {toast && <div className={`toast ${toast.error ? "error" : ""}`}>{toast.text}</div>}
    </div>
  );
}
