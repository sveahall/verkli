"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
const CoverEditorModal = dynamic(() => import("@/components/books/cover-editor/CoverEditorModal"), { ssr: false });
export default function Preview() {
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState(false);
  const [brokenImage, setBrokenImage] = useState(false);
  const [saved, setSaved] = useState("");
  return <main className="mx-auto max-w-3xl space-y-5 p-8">
    <h1 className="text-3xl font-semibold">Local cover editor fixture</h1>
    <p>Synthetic save only. Downloads are real local image files. No provider, upload or book change occurs.</p>
    <label className="block"><input type="checkbox" checked={failure} onChange={(event) => setFailure(event.target.checked)} /> Simulate save failure</label>
    <label className="block"><input type="checkbox" checked={brokenImage} onChange={(event) => setBrokenImage(event.target.checked)} /> Simulate missing image</label>
    <button className="rounded-xl bg-primary px-4 py-3 text-primary-foreground" onClick={() => setOpen(true)}>Open cover editor</button>
    {saved && <p role="status">{saved}</p>}
    {open && <CoverEditorModal imageUrl={brokenImage ? "/fixture-image-does-not-exist.png" : "/demo-assets/covers/01.jpg"} bookId={brokenImage ? "local-cover-missing-fixture" : "local-cover-export-fixture"} bookTitle="The lighthouse" authorName="Sample author" onClose={() => setOpen(false)} onSave={async (file) => {
      if (failure) throw new Error("Synthetic save failure");
      setSaved(`Simulated save: ${file.name} · ${file.type} · ${file.size} bytes`);
      setOpen(false);
    }} />}
  </main>;
}
