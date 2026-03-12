"use client";

import { buildWaitlistHtml } from "@/lib/emails/waitlist-confirmation";

const EXAMPLE_EMAIL = "preview@example.com";

export default function AuthorWaitlistEmailPreviewPage() {
  const html = buildWaitlistHtml({
    variant: "author",
    email: EXAMPLE_EMAIL,
    position: 42,
    name: "Preview User",
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        margin: 0,
        padding: 0,
        background: "#f4f3f5",
      }}
    >
      <iframe
        title="Author waitlist email"
        srcDoc={html}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          display: "block",
        }}
      />
    </div>
  );
}
