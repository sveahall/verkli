"use client";

import { ArrowUpRight } from "lucide-react";
import { AuthorStoryProvider, AuthorStudioExperience } from "@/features/author/AuthorStoryExperience";

export default function WaitlistProductPreview() {
  return (
    <section className="wl-studio wl-shell" aria-labelledby="waitlist-studio-heading">
      <div className="wl-studio-heading">
        <h2 id="waitlist-studio-heading">A little of what’s waiting for you.</h2>
        <a href="#join-waitlist">Get early access <ArrowUpRight size={16} aria-hidden="true" /></a>
      </div>
      <AuthorStoryProvider>
        <AuthorStudioExperience />
      </AuthorStoryProvider>
    </section>
  );
}
