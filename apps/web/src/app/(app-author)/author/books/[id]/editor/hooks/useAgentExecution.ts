"use client";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { createAgentEditTransaction, type ExecuteAgentAction, type ProposalContext, type ActionResult } from "@/features/ai-team/actions/editor-action";
import { agentActionSchema, extractAgentChapterText, type AgentAction } from "@/lib/ai/agent-actions";
import type { Chapter, Tool } from "../BookEditorView.types";
import type { useBookCover } from "./useBookCover";
import type { useBookPricing } from "./useBookPricing";

type Options = { bookId: string; chapter: Chapter | null; navigate: (tool: Tool) => void;
  cover: ReturnType<typeof useBookCover>; pricing: ReturnType<typeof useBookPricing>; demo: boolean };
type PendingEdit = { action: Extract<AgentAction, {kind: "edit_text"}>; context: ProposalContext; resolve: (value: ActionResult) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

export function useAgentExecution(options: Options) {
  const current = useRef(options);
  useLayoutEffect(() => { current.current = options; });
  const editorRef = useRef<{ editor: Editor; chapterId: string } | null>(null);
  const pending = useRef<PendingEdit | null>(null);
  const finishEdit = useCallback((editor: Editor, action: Extract<AgentAction, {kind: "edit_text"}>, context: ProposalContext): ActionResult => {
    const { chapter } = current.current;
    if (editor.isDestroyed) throw new Error("The editor is no longer open. Open the chapter and retry.");
    const transaction = createAgentEditTransaction(editor.state, chapter?.id ?? null, context, action);
    editor.view.dispatch(transaction);
    // Normal Tiptap onUpdate handles dirty state and the existing autosave queue.
    return { message: "Applied to your draft. Check the editor’s save status; Undo is available." };
  }, []);
  const onEditorReady = useCallback((editor: Editor | null, chapterId: string) => {
    if (!editor) { if (editorRef.current?.chapterId === chapterId) editorRef.current = null; return; }
    if (current.current.chapter?.id !== chapterId) return;
    editorRef.current = { editor, chapterId };
    const request = pending.current;
    if (request) {
      pending.current = null;
      clearTimeout(request.timer);
      try { request.resolve(finishEdit(editor, request.action, request.context)); }
      catch (error) { request.reject(error instanceof Error ? error : new Error("The correction could not be applied.")); }
    }
  }, [finishEdit]);
  useEffect(() => {
    const request = pending.current;
    if (request && request.context.chapterId !== options.chapter?.id) {
      clearTimeout(request.timer); pending.current = null;
      request.reject(new Error("The chapter changed before the editor opened. No correction was applied."));
    }
  }, [options.chapter?.id]);
  useEffect(() => () => {
    const request = pending.current;
    if (request) { clearTimeout(request.timer); pending.current = null; request.reject(new Error("The book was closed before the change could be applied.")); }
  }, [options.bookId]);
  const getDraftText = useCallback(() => {
    const { chapter } = current.current;
    if (!chapter) return undefined;
    const live = editorRef.current;
    return live && live.chapterId === chapter.id && !live.editor.isDestroyed
      ? extractAgentChapterText(live.editor.getJSON()) : extractAgentChapterText(chapter.content);
  }, []);
  const execute: ExecuteAgentAction = useCallback(async (proposal, context) => {
    const action = agentActionSchema.parse(proposal);
    const { chapter, navigate, cover, pricing, demo } = current.current;
    if (action.kind === "edit_text") {
      if (!chapter || context.chapterId !== chapter.id) throw new Error("Open the same chapter before applying this correction.");
      if (getDraftText() !== context.chapterText) throw new Error("This chapter has changed. Ask for an updated suggestion.");
      const live = editorRef.current;
      if (live && live.chapterId === chapter.id && !live.editor.isDestroyed) return finishEdit(live.editor, action, context);
      if (pending.current) throw new Error("Another correction is opening in the editor. Wait for it to finish.");
      return new Promise<ActionResult>((resolve, reject) => {
        const timer = setTimeout(() => { pending.current = null; reject(new Error("The editor could not open. Open Write and retry this proposal.")); }, 15_000);
        pending.current = { action, context, resolve, reject, timer };
        navigate("edit");
      });
    }
    if (action.kind === "cover_brief") {
      if (demo) throw new Error("Open a regular author book to generate new cover options from this conversation.");
      cover.setCoverAITemplate(null);
      cover.setCoverAIPrompt(action.prompt);
      cover.setCoverAIStyle(action.style);
      navigate("cover");
      const success = await cover.handleCoverAIGenerate({ prompt: action.prompt, style: action.style });
      if (!success) throw new Error("Cover options were not generated. Check the cover panel’s message, then retry.");
      return { message: "New options are ready in Cover. Choose one to replace your current cover." };
    }
    if (action.kind === "pricing_draft") {
      if (!["SEK", "EUR", "USD"].includes(action.currency)) throw new Error("Choose SEK, EUR or USD so this price can be prepared in the pricing panel.");
      if (pricing.pricingSaving) throw new Error("Wait for the current price to finish saving, then retry.");
      pricing.setPriceAmountMinor(Math.round(action.amount * 100));
      pricing.setPriceCurrency(action.currency);
      navigate("pricing");
      return { message: "Price prepared in Pricing. Review it and press Save to apply it." };
    }
    throw new Error("This proposal does not have a supported workspace action.");
  }, [finishEdit, getDraftText]);
  return { onEditorReady, getDraftText, execute };
}
