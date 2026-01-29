"use client";

import Link from "next/link";

type FooterVariant = "reader" | "writer";

const linkClass =
  "transition-colors hover:text-slate-900 dark:hover:text-white/80";
const columnHeaderClass =
  "text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40";
const columnLinkClass = "space-y-3 text-[15px] text-slate-600 dark:text-white/50";

export default function Footer({ variant = "reader" }: { variant?: FooterVariant }) {
  return (
    <footer className="relative mx-auto w-full max-w-[1200px] px-4 pb-8 pt-6 sm:px-6 sm:pb-12 sm:pt-8">
      <div className="grid gap-8 rounded-2xl bg-gradient-to-b from-black/[0.04] to-transparent p-6 sm:gap-10 sm:rounded-[32px] sm:p-10 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:gap-12 md:p-12 dark:from-white/[0.04]">
        <div className="space-y-5">
          <Link href="/" className="inline-block">
            <img src="/logo-dark.svg" alt="Verkli" className="h-9 w-auto dark:hidden" />
            <img src="/favicon.svg" alt="Verkli" className="hidden h-9 w-auto dark:block" />
          </Link>
          <p className="max-w-[280px] text-[15px] leading-[1.7] text-slate-600 dark:text-white/50">
            Where books become momentum. The platform for authors who want to reach readers everywhere.
          </p>
          <div className="flex gap-3 pt-2">
            <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.05] text-slate-500 transition-all hover:bg-black/10 hover:text-slate-700 dark:bg-white/[0.05] dark:text-white/50 dark:hover:bg-white/[0.1] dark:hover:text-white/80">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/>
              </svg>
            </a>
            <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.05] text-slate-500 transition-all hover:bg-black/10 hover:text-slate-700 dark:bg-white/[0.05] dark:text-white/50 dark:hover:bg-white/[0.1] dark:hover:text-white/80">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
              </svg>
            </a>
            <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.05] text-slate-500 transition-all hover:bg-black/10 hover:text-slate-700 dark:bg-white/[0.05] dark:text-white/50 dark:hover:bg-white/[0.1] dark:hover:text-white/80">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"/>
              </svg>
            </a>
          </div>
        </div>
        <div className="space-y-4">
          <p className={columnHeaderClass}>Product</p>
          <ul className={columnLinkClass}>
            <li><a href="#" className={linkClass}>Features</a></li>
            <li><a href="#" className={linkClass}>Pricing</a></li>
            <li><a href="#" className={linkClass}>Examples</a></li>
            <li><a href="#" className={linkClass}>Integrations</a></li>
          </ul>
        </div>
        <div className="space-y-4">
          <p className={columnHeaderClass}>Company</p>
          <ul className={columnLinkClass}>
            <li><a href="#" className={linkClass}>About</a></li>
            <li><a href="#" className={linkClass}>Blog</a></li>
            <li><a href="#" className={linkClass}>Careers</a></li>
            <li><a href="#" className={linkClass}>Contact</a></li>
          </ul>
        </div>
        <div className="space-y-4">
          <p className={columnHeaderClass}>Legal</p>
          <ul className={columnLinkClass}>
            <li><a href="#" className={linkClass}>Privacy</a></li>
            <li><a href="#" className={linkClass}>Terms</a></li>
            <li><a href="#" className={linkClass}>Cookie Policy</a></li>
          </ul>
        </div>
      </div>
      <div className="mt-8 flex flex-col items-center justify-between gap-4 px-4 text-[13px] text-slate-500 dark:text-white/30 md:flex-row">
        <span>© 2026 Verkli. All rights reserved.</span>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-400"></span>
          <span>All systems operational</span>
        </div>
      </div>
    </footer>
  );
}
