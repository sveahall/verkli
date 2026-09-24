import { createHash } from "node:crypto";

export const unsubscribePrivacyHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
};
export function privateUnsubscribeResponse(response: Response): Response {
  for (const [name, value] of Object.entries(unsubscribePrivacyHeaders)) response.headers.set(name, value);
  return response;
}
const styles = `:root{color-scheme:light dark;--page:#fbfaf9;--card:#fff;--text:#19171c;--muted:#6c6870;--border:#e7e2e9;--button:#24182f;--on-button:#fff}*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--text);font:16px/1.6 system-ui,sans-serif}main{max-width:38rem;margin:12vh auto;padding:2rem;border:1px solid var(--border);border-radius:24px;background:var(--card)}h1{font-size:clamp(1.7rem,5vw,2.2rem);line-height:1.2;letter-spacing:-.03em;font-weight:500}p{color:var(--muted)}.eyebrow{font-size:.875rem}.notice{color:var(--text);border-left:3px solid currentColor;padding-left:1rem}button{min-height:44px;padding:.7rem 1.4rem;border:0;border-radius:999px;background:var(--button);color:var(--on-button);font:inherit;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #907aff;outline-offset:4px}a{color:var(--text);text-underline-offset:4px}.actions{display:flex;flex-wrap:wrap;align-items:center;gap:1.25rem;margin-top:1.75rem}@media(max-width:640px){main{margin:2rem 1rem;padding:1.5rem}}@media(prefers-color-scheme:dark){:root{--page:#17131d;--card:#221b2b;--text:#f7f3f8;--muted:#b6aebf;--border:#3a3043;--button:#eadff5;--on-button:#24182f}}`;
const styleHash = createHash("sha256").update(styles).digest("base64");
export const unsubscribeContentSecurityPolicy = `default-src 'none'; style-src 'sha256-${styleHash}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
export type UnsubscribePageState = "confirm" | "success" | "invalid" | "failed";
/** Standalone document: no app layout, scripts, analytics, fonts or external assets. */
export function unsubscribePage(state: UnsubscribePageState, options: { token?: string; action?: string; testMode?: boolean } = {}): Response {
  const title = {
    confirm: "Unsubscribe from this newsletter?",
    success: "You are unsubscribed",
    invalid: "This link is invalid or expired",
    failed: "We could not confirm your unsubscribe",
  }[state];
  const description = {
    confirm: "Confirm below to stop this author's newsletter. Opening this page has not changed your subscription. Your other subscriptions will stay the same.",
    success: "Your subscription to this author's newsletter has been stopped. Your other subscriptions have not changed. You can close this page.",
    invalid: "No subscription was changed. Open the unsubscribe link in a more recent newsletter, or manage your subscriptions in your account.",
    failed: "We could not confirm that the change was saved. Please try again. No sign-in is required.",
  }[state];
  const form = (state === "confirm" || state === "failed") && options.token
    ? `<form method="post" action="${escapeHtml(options.action ?? "/api/newsletters/unsubscribe")}"><input type="hidden" name="token" value="${escapeHtml(options.token)}"><input type="hidden" name="confirm" value="unsubscribe"><div class="actions"><button type="submit">${state === "failed" ? "Try again" : "Confirm unsubscribe"}</button><a href="/" rel="noreferrer">${state === "failed" ? "Leave this page" : "Keep my subscription"}</a></div></form>` : "";
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${title} · Newsletter settings</title><style>${styles}</style></head><body><main><p class="eyebrow">Newsletter settings</p>${options.testMode ? '<p class="notice">Synthetic preview only. No real subscription or email is changed.</p>' : ""}<h1>${title}</h1><p${state === "invalid" || state === "failed" ? ' role="alert"' : ""}>${description}</p>${form}</main></body></html>`, {
    status: state === "invalid" ? 400 : state === "failed" ? 500 : 200,
    headers: {
      ...unsubscribePrivacyHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": unsubscribeContentSecurityPolicy,
    },
  });
}
