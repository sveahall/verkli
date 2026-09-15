"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import TiptapEditor from "@/components/editor/TiptapEditor";
import { ToastProvider } from "@/components/ui/toast";
import AiAssistantPanel from "@/app/(app-author)/author/books/[id]/editor/panels/AiAssistantPanel";
import { useAgentExecution } from "@/app/(app-author)/author/books/[id]/editor/hooks/useAgentExecution";
import { useBookCover } from "@/app/(app-author)/author/books/[id]/editor/hooks/useBookCover";
import { useBookPricing } from "@/app/(app-author)/author/books/[id]/editor/hooks/useBookPricing";
import type { Book, Chapter, Tool } from "@/app/(app-author)/author/books/[id]/editor/BookEditorView.types";
import { conversationTool, agentConversations } from "@/features/ai-team/agent-conversations";
import AgentCompanion from "@/features/ai-team/AgentCompanion";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import { extractAgentChapterText } from "@/lib/ai/agent-actions";

const BOOK_ID = "00000000-0000-4000-8000-000000000001";
const CHAPTER_ID = "00000000-0000-4000-8000-000000000002";
const BOOK = {id:BOOK_ID,title:"The harbour",cover_image:null,price_amount:0,price_currency:"SEK"} as Book;
const DOC = { type:"doc",content:[{type:"heading",attrs:{level:2},content:[{type:"text",text:"The harbour"}]}, {type:"paragraph",content:[{type:"text",text:"Mira heard a "},{type:"text",text:"wierd",marks:[{type:"bold"}]},{type:"text",text:" sound beside the boat."}]}] };
const CHAPTERS: Chapter[] = [
  {id:CHAPTER_ID, title:"The harbour",content:JSON.stringify(DOC),order:1,book_version_id:"preview-edition"},
  {id:"00000000-0000-4000-8000-000000000003", title:"The crossing",content:JSON.stringify({type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"Mira took the boat across the bay."}]}]}),order:2,book_version_id:"preview-edition"},
];
function silentWav() {
  const bytes = new ArrayBuffer(844); const view = new DataView(bytes);
  const word = (offset:number,text:string) => [...text].forEach((char,index) => view.setUint8(offset+index,char.charCodeAt(0)));
  word(0,"RIFF"); view.setUint32(4,836,true); word(8,"WAVEfmt "); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
  view.setUint32(24,8000,true); view.setUint32(28,16000,true); view.setUint16(32,2,true); view.setUint16(34,16,true); word(36,"data"); view.setUint32(40,800,true);
  return bytes;
}
export default function ConversationPreview() { return <ToastProvider><Preview /></ToastProvider>; }
function Preview() {
  const [ready,setReady] = useState(false);
  const [tool,setTool] = useState<Tool>("edit");
  const [assistantTool,setAssistantTool] = useState<Tool>("edit");
  const [open,setOpen] = useState(true);
  const [chapters,setChapters] = useState(CHAPTERS);
  const [chapterIndex,setChapterIndex] = useState(0);
  const [mode,setMode] = useState("normal");
  const modeRef = useRef(mode);
  const [requests,setRequests] = useState<unknown[]>([]);
  const [saves,setSaves] = useState(0);
  const [saved,setSaved] = useState(false);
  const cover = useBookCover({book:BOOK});
  const pricing = useBookPricing({book:BOOK});
  const chapter = chapters[chapterIndex];
  const execution = useAgentExecution({bookId:BOOK_ID,chapter,navigate:setTool,cover,pricing,demo:false});
  const { onEditorReady } = execution;
  const onReady = useCallback((editor:Editor) => onEditorReady(editor,chapter.id), [onEditorReady,chapter.id]);
  useEffect(() => () => onEditorReady(null,chapter.id),[onEditorReady,chapter.id,tool]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input),location.origin);
      if (!url.pathname.startsWith("/api/") && url.origin === location.origin && (!init?.method || init.method === "GET")) return original(input,init);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      setRequests((items) => [...items,{path:url.pathname,body}]);
      // No fixture request can reach a real provider or a database.
      if (url.origin !== location.origin) return Response.json({error:"PREVIEW_ONLY"},{status:403});
      if (modeRef.current === "failure") return Response.json({error:"SIMULATED_FAILURE"},{status:502});
      if (modeRef.current === "delay") await new Promise<void>((resolve,reject) => {
        const timer = setTimeout(resolve,1500);
        init?.signal?.addEventListener("abort",()=>{clearTimeout(timer);reject(new DOMException("Aborted","AbortError"));},{once:true});
      });
      if (url.pathname.endsWith("/ai/chat")) {
        const text = body.draftText ?? extractAgentChapterText(CHAPTERS[0].content);
        const proposal = body.tool === "cover" ? {kind:"cover_brief",prompt:"A quiet blue harbour at dusk, a small boat and a warm window, ample space for the title.",style:"illustrated",reason:"A focused composition inspired by the setting."}
          : body.tool === "audiobook" ? {kind:"pronunciation",word:"Mira",spokenAs:"Mee-rah",sampleText:"Mira heard a sound beside the boat.",reason:"Try this spoken form without changing the written name."}
          : body.tool === "pricing" ? {kind:"pricing_draft",amount:99,currency:"SEK",reason:"Your requested price, ready for review."}
          : text.includes("wierd") ? {kind:"edit_text",original:"Mira heard a wierd sound beside the boat.",replacement:"Mira heard a weird sound beside the boat.",reason:"Correct the spelling while keeping the sentence and its emphasis."} : null;
        return Response.json({content: body.history?.length ? "We can build on that. Review this next suggestion." : "Here is a precise suggestion for your review.",source:["fallback","invalid"].includes(modeRef.current) ? "template" : "llm",failureReason:modeRef.current === "invalid" ? "invalid_proposal" : "unavailable",actions:proposal && !["fallback","invalid"].includes(modeRef.current) ? [proposal] : [],context:{chapterId:body.chapterId,chapterText:text}});
      }
      if (url.pathname.endsWith("/audiobook/preview")) return new Response(silentWav(),{headers:{"content-type":"audio/wav"}});
      if (url.pathname.endsWith("/cover/generate")) return Response.json({images:["/demo-assets/covers/01.jpg","/demo-assets/covers/02.jpg","/demo-assets/covers/03.jpg","/demo-assets/covers/04.jpg"]});
      return Response.json({error:"PREVIEW_ONLY"},{status:403});
    };
    const frame = requestAnimationFrame(() => setReady(true));
    return () => { cancelAnimationFrame(frame); window.fetch = original; };
  },[]);
  const update = useCallback((doc: Record<string,unknown>) => {
    setChapters((items) => items.map((item) => item.id === chapter.id ? {...item,content:JSON.stringify(doc)} : item));
    setSaves((value) => value+1); setSaved(true);
  },[chapter.id]);
  if (!ready) return null;
  const persona = agentConversations[conversationTool(tool)];
  return <main style={{width:"100%",maxWidth:1480,margin:"auto",padding:16}}>
    <p style={{fontSize:12,marginBottom:16}}>Development fixture: synthetic book, simulated replies and silent audio. No provider calls or database writes.</p>
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {(["edit","translate","audiobook","cover","pricing"] as Tool[]).map((value) => <button className="rounded-lg border border-border px-4 py-3" type="button" key={value} onClick={() => {setTool(value);setAssistantTool(value);setOpen(true);}}>{value}</button>)}
      <button type="button" className="rounded-lg border border-border px-4 py-3" onClick={() => setChapterIndex((value) => 1-value)}>Switch chapter</button>
      <button type="button" className="rounded-lg border border-border px-4 py-3" onClick={() => document.documentElement.classList.toggle("dark")}>Toggle theme</button>
      <label>Response <select aria-label="Response mode" value={mode} onChange={(event) => setMode(event.target.value)}>{["normal","failure","delay","fallback","invalid"].map((value) => <option key={value}>{value}</option>)}</select></label>
    </div>
    <WorkspaceLayout header={<h1 className="font-display text-2xl">The harbour</h1>} asideOpen={open} onAsideClose={() => setOpen(false)} asideLabel="Book specialist"
      aside={<AiAssistantPanel bookId={BOOK_ID} chapterId={chapter.id} chapterTitle={chapter.title} activeTool={assistantTool} variant="dock" onClose={() => setOpen(false)} getDraftText={execution.getDraftText} onExecuteAction={execution.execute} />}
      main={<div>
        <AgentCompanion agent={persona.agent} onTalk={() => {setAssistantTool(tool);setOpen(true);}} />
        {tool === "edit" && <TiptapEditor key={chapter.id} content={chapter.content ?? ""} chapterId={chapter.id} bookId={BOOK_ID} onUpdate={update} onDirty={() => setSaved(false)} onEditorReady={onReady} />}
        {tool === "cover" && <div><p data-testid="cover-brief">{cover.coverAIPrompt}</p><p data-testid="cover-options">{cover.coverAIGeneratedUrls.length} options</p><p>{cover.coverAIError}</p></div>}
        {tool === "pricing" && <p data-testid="price-draft">{pricing.priceAmountMinor / 100} {pricing.priceCurrency} — not saved</p>}
        {tool === "translate" && <p>Current edition: {extractAgentChapterText(chapter.content)}</p>}
        <output data-testid="save-status">{saved ? "Saved locally" : "Draft"} · {saves} saves</output>
      </div>} />
    <details className="mt-8"><summary>Fixture evidence</summary><pre data-testid="request-evidence">{JSON.stringify(requests,null,2)}</pre><pre data-testid="chapter-evidence">{chapter.content}</pre></details>
  </main>;
}
