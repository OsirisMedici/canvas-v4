"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bold, ChevronLeft, Code2, GripVertical, Heading2, Italic, List, LoaderCircle,
  MoreHorizontal, Plus, Quote, Rows3, Save, Trash2, X,
} from "lucide-react";
import type { ThinkingCard, ThinkingColumn } from "@/lib/types";

type ThinkingBoardData = { columns: ThinkingColumn[]; cards: ThinkingCard[] };
type SaveState = "saved" | "saving" | "unsaved" | "error";

interface ThinkingBoardProps {
  boardId: string;
  boardName: string;
  query: string;
  onMutated: () => Promise<void>;
  notify: (text: string, error?: boolean) => void;
}

export function ThinkingBoard({ boardId, boardName, query, onMutated, notify }: ThinkingBoardProps) {
  const [data, setData] = useState<ThinkingBoardData>({ columns: [], cards: [] });
  const [loading, setLoading] = useState(true);
  const [newColumnName, setNewColumnName] = useState("");
  const [addingColumn, setAddingColumn] = useState(false);
  const [busyColumnId, setBusyColumnId] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState("");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const lastSavedRef = useRef("");

  const activeCard = data.cards.find((card) => card.id === activeCardId) || null;
  const normalizedQuery = query.trim().toLowerCase();

  const visibleCards = useMemo(() => {
    if (!normalizedQuery) return data.cards;
    return data.cards.filter((card) =>
      card.title.toLowerCase().includes(normalizedQuery) ||
      card.content_text.toLowerCase().includes(normalizedQuery),
    );
  }, [data.cards, normalizedQuery]);

  const loadBoard = useCallback(async () => {
    const response = await fetch(`/api/boards/${boardId}/thinking`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load the Thinking Board.");
    setData({ columns: payload.columns, cards: payload.cards });
  }, [boardId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setActiveCardId(null);
      void loadBoard()
        .catch((error) => notify(error instanceof Error ? error.message : "Could not load the Thinking Board.", true))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadBoard, notify]);

  const saveDocument = useCallback(async (cardId: string, title: string, contentText: string) => {
    const serialized = JSON.stringify([title.trim() || "Untitled", contentText]);
    if (serialized === lastSavedRef.current) return true;
    setSaveState("saving");
    try {
      const response = await fetch(`/api/thinking-cards/${cardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, contentText }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save the document.");
      const card = payload.card as ThinkingCard;
      setData((current) => ({ ...current, cards: current.cards.map((entry) => entry.id === card.id ? card : entry) }));
      setDraftTitle(card.title);
      lastSavedRef.current = JSON.stringify([card.title, card.content_text]);
      setSaveState("saved");
      return true;
    } catch (error) {
      setSaveState("error");
      notify(error instanceof Error ? error.message : "Could not save the document.", true);
      return false;
    }
  }, [notify]);

  useEffect(() => {
    if (!activeCardId || saveState !== "unsaved") return;
    const timer = window.setTimeout(() => {
      void saveDocument(activeCardId, draftTitle, draftContent);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [activeCardId, draftContent, draftTitle, saveDocument, saveState]);

  function openCard(card: ThinkingCard) {
    setActiveCardId(card.id);
    setDraftTitle(card.title);
    setDraftContent(card.content_text);
    lastSavedRef.current = JSON.stringify([card.title, card.content_text]);
    setSaveState("saved");
  }

  async function closeDocument() {
    if (activeCardId && saveState !== "saved") {
      const saved = await saveDocument(activeCardId, draftTitle, draftContent);
      if (!saved) return;
    }
    setActiveCardId(null);
  }

  async function addColumn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newColumnName.trim();
    if (!name || addingColumn) return;
    setAddingColumn(true);
    try {
      const response = await fetch(`/api/boards/${boardId}/thinking`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not add the column.");
      setData((current) => ({ ...current, columns: [...current.columns, payload.column] }));
      setNewColumnName("");
      notify(`Column “${payload.column.name}” added.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not add the column.", true);
    } finally {
      setAddingColumn(false);
    }
  }

  async function renameColumn(column: ThinkingColumn) {
    const name = editingColumnName.trim();
    setEditingColumnId(null);
    if (!name || name === column.name) return;
    try {
      const response = await fetch(`/api/thinking-columns/${column.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not rename the column.");
      setData((current) => ({
        ...current,
        columns: current.columns.map((entry) => entry.id === column.id ? payload.column : entry),
      }));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not rename the column.", true);
    }
  }

  async function deleteColumn(column: ThinkingColumn) {
    const cardCount = data.cards.filter((card) => card.column_id === column.id).length;
    const warning = cardCount
      ? `Delete “${column.name}” and its ${cardCount} document${cardCount === 1 ? "" : "s"}?`
      : `Delete the empty “${column.name}” column?`;
    if (!window.confirm(warning)) return;
    setBusyColumnId(column.id);
    try {
      const response = await fetch(`/api/thinking-columns/${column.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not delete the column.");
      setData((current) => ({
        columns: current.columns.filter((entry) => entry.id !== column.id),
        cards: current.cards.filter((card) => card.column_id !== column.id),
      }));
      if (activeCard?.column_id === column.id) setActiveCardId(null);
      await onMutated();
      notify(`Column “${column.name}” deleted.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not delete the column.", true);
    } finally {
      setBusyColumnId(null);
    }
  }

  async function createCard(columnId: string) {
    setBusyColumnId(columnId);
    try {
      const response = await fetch(`/api/thinking-columns/${columnId}/cards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Untitled" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not create the document.");
      const card = payload.card as ThinkingCard;
      setData((current) => ({ ...current, cards: [...current.cards, card] }));
      await onMutated();
      openCard(card);
      window.setTimeout(() => titleRef.current?.select(), 60);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not create the document.", true);
    } finally {
      setBusyColumnId(null);
    }
  }

  async function deleteCard(card: ThinkingCard) {
    if (!window.confirm(`Delete “${card.title}”? Its Notion.md document will also be removed.`)) return;
    try {
      const response = await fetch(`/api/thinking-cards/${card.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not delete the document.");
      setData((current) => ({ ...current, cards: current.cards.filter((entry) => entry.id !== card.id) }));
      if (activeCardId === card.id) setActiveCardId(null);
      await onMutated();
      notify("Document deleted.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not delete the document.", true);
    }
  }

  async function moveCard(cardId: string, columnId: string) {
    const card = data.cards.find((entry) => entry.id === cardId);
    if (!card || card.column_id === columnId) return;
    setData((current) => ({
      ...current,
      cards: current.cards.map((entry) => entry.id === cardId ? { ...entry, column_id: columnId } : entry),
    }));
    try {
      const response = await fetch(`/api/thinking-cards/${cardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ columnId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not move the document.");
      setData((current) => ({
        ...current,
        cards: current.cards.map((entry) => entry.id === cardId ? payload.card : entry),
      }));
    } catch (error) {
      setData((current) => ({
        ...current,
        cards: current.cards.map((entry) => entry.id === cardId ? card : entry),
      }));
      notify(error instanceof Error ? error.message : "Could not move the document.", true);
    }
  }

  function insertMarkdown(prefix: string, suffix = "", placeholder = "text") {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = draftContent.slice(start, end) || placeholder;
    const next = `${draftContent.slice(0, start)}${prefix}${selected}${suffix}${draftContent.slice(end)}`;
    setDraftContent(next);
    setSaveState("unsaved");
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  if (loading) {
    return <div className="thinking-loading"><LoaderCircle className="spin" size={18} /> Opening Thinking Board…</div>;
  }

  return <>
    <section className="thinking-board" aria-label={`${boardName} Thinking Board`}>
      {!data.columns.length ? <div className="thinking-empty">
        <Rows3 size={27} />
        <h2>Start with your first column</h2>
        <p>Name the stages that match how you think. Add as many as you need.</p>
      </div> : <div className="thinking-columns">
        {data.columns.map((column) => {
          const cards = visibleCards.filter((card) => card.column_id === column.id);
          return <section
            className={`thinking-column ${draggedCardId ? "drag-target" : ""}`}
            key={column.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const cardId = event.dataTransfer.getData("application/x-thinking-card") || draggedCardId;
              setDraggedCardId(null);
              if (cardId) void moveCard(cardId, column.id);
            }}
          >
            <header className="thinking-column-header">
              <span className="thinking-column-dot" />
              {editingColumnId === column.id
                ? <input
                    autoFocus
                    value={editingColumnName}
                    maxLength={80}
                    onChange={(event) => setEditingColumnName(event.target.value)}
                    onBlur={() => void renameColumn(column)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setEditingColumnId(null);
                    }}
                  />
                : <button className="thinking-column-name" onDoubleClick={() => {
                    setEditingColumnId(column.id);
                    setEditingColumnName(column.name);
                  }}>{column.name}</button>}
              <span className="thinking-column-count">{cards.length}</span>
              <button
                className="thinking-column-menu"
                title="Delete column"
                aria-label={`Delete ${column.name}`}
                disabled={busyColumnId === column.id}
                onClick={() => void deleteColumn(column)}
              >{busyColumnId === column.id ? <LoaderCircle className="spin" size={13} /> : <MoreHorizontal size={14} />}</button>
            </header>

            <div className="thinking-card-list">
              {cards.map((card) => <article
                className="thinking-card"
                key={card.id}
                draggable
                onDragStart={(event) => {
                  setDraggedCardId(card.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-thinking-card", card.id);
                }}
                onDragEnd={() => setDraggedCardId(null)}
                onClick={() => openCard(card)}
              >
                <GripVertical className="thinking-card-grip" size={14} />
                <div>
                  <h3>{card.title}</h3>
                  <p>{card.content_text.trim() || "Empty document — click to start writing"}</p>
                </div>
                <button aria-label={`Delete ${card.title}`} onClick={(event) => { event.stopPropagation(); void deleteCard(card); }}><Trash2 size={12} /></button>
              </article>)}
              {!cards.length && <div className="thinking-column-empty">{normalizedQuery ? "No matching documents" : "No documents yet"}</div>}
            </div>

            <button className="thinking-add-card" disabled={busyColumnId === column.id} onClick={() => void createCard(column.id)}>
              {busyColumnId === column.id ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}
              New document
            </button>
          </section>;
        })}

        <form className="thinking-add-column" onSubmit={addColumn}>
          <Plus size={15} />
          <input
            value={newColumnName}
            maxLength={80}
            onChange={(event) => setNewColumnName(event.target.value)}
            placeholder="Add a column"
            aria-label="New column name"
          />
          {newColumnName.trim() && <button disabled={addingColumn}>{addingColumn ? "Adding…" : "Add"}</button>}
        </form>
      </div>}

      {!data.columns.length && <form className="thinking-first-column" onSubmit={addColumn}>
        <input autoFocus value={newColumnName} maxLength={80} onChange={(event) => setNewColumnName(event.target.value)} placeholder="e.g. Ideas" />
        <button disabled={!newColumnName.trim() || addingColumn}>{addingColumn ? "Creating…" : "Create column"}</button>
      </form>}
    </section>

    {activeCard && <div className="thinking-document-backdrop" role="dialog" aria-modal="true" aria-label={`Editing ${activeCard.title}`}>
      <article className="thinking-document">
        <header className="thinking-document-bar">
          <button className="thinking-back" onClick={() => void closeDocument()}><ChevronLeft size={16} />{boardName}</button>
          <div className={`thinking-save-state ${saveState}`}>
            {saveState === "saving" ? <LoaderCircle className="spin" size={13} /> : <Save size={13} />}
            {saveState === "saved" ? "Saved locally" : saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Unsaved"}
          </div>
          <button className="thinking-close" onClick={() => void closeDocument()} aria-label="Close document"><X size={17} /></button>
        </header>

        <div className="thinking-document-toolbar" aria-label="Markdown formatting">
          <button title="Heading" onMouseDown={(event) => { event.preventDefault(); insertMarkdown("## ", "", "Heading"); }}><Heading2 size={15} /></button>
          <button title="Bold" onMouseDown={(event) => { event.preventDefault(); insertMarkdown("**", "**"); }}><Bold size={15} /></button>
          <button title="Italic" onMouseDown={(event) => { event.preventDefault(); insertMarkdown("_", "_"); }}><Italic size={15} /></button>
          <button title="Bulleted list" onMouseDown={(event) => { event.preventDefault(); insertMarkdown("- ", "", "List item"); }}><List size={15} /></button>
          <button title="Quote" onMouseDown={(event) => { event.preventDefault(); insertMarkdown("> ", "", "Quote"); }}><Quote size={15} /></button>
          <button title="Code" onMouseDown={(event) => { event.preventDefault(); insertMarkdown("`", "`", "code"); }}><Code2 size={15} /></button>
        </div>

        <div className="thinking-paper">
          <input
            ref={titleRef}
            className="thinking-document-title"
            value={draftTitle}
            maxLength={160}
            onChange={(event) => { setDraftTitle(event.target.value); setSaveState("unsaved"); }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                editorRef.current?.focus();
              }
            }}
            placeholder="Untitled"
          />
          <textarea
            ref={editorRef}
            className="thinking-document-body"
            value={draftContent}
            onChange={(event) => { setDraftContent(event.target.value); setSaveState("unsaved"); }}
            placeholder={"Start writing…\n\nUse Markdown for headings, lists, quotes, code, and dividers."}
            spellCheck
          />
        </div>
      </article>
    </div>}
  </>;
}
