import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { buildWaitlistHtml, buildWaitlistSubject } from "./waitlist-confirmation";

const fixture = { email: "waiting@example.com", position: 42 };

describe("waitlist confirmation", () => {
  it.each(["author", "reader"] as const)("keeps %s access pending until a separate selection email", (variant) => {
    const options = { ...fixture, variant };
    const $ = load(buildWaitlistHtml(options));
    const body = $("body").text();

    expect(buildWaitlistSubject(options)).toContain("waitlist");
    expect(body).toContain("Beta access is still pending");
    expect(body).toContain("If you're selected");
    expect(body).toMatch(/separate invitation/i);
    expect(body).toContain(fixture.email);
    expect($("a[href='mailto:hello@verkli.com']")).toHaveLength(1);
    expect(body).not.toMatch(/1,?200|EUR|unlimited|any language|any format|reply to this email/i);
  });

  it("keeps the conditional Pro offer and generation limits for authors", () => {
    const $ = load(buildWaitlistHtml({ ...fixture, variant: "author" }));
    const body = $("body").text();

    expect(body).toMatch(/Verkli Pro for free\s+until public launch/i);
    expect(body).toMatch(/generation.*usage limits/i);
  });

  it("does not promise author benefits to readers", () => {
    const html = buildWaitlistHtml({ ...fixture, variant: "reader" });
    expect(html).not.toMatch(/Verkli Pro|generation|translation|marketing tools/i);
  });

  it("escapes the greeting and waitlisted address", () => {
    const options = { ...fixture, variant: "author" as const, name: "<script>alert('name')</script>", email: "<email>&\"'@example.com" };
    const html = buildWaitlistHtml(options);
    const $ = load(html);

    expect($("script")).toHaveLength(0);
    expect($("body").text()).toContain(`Hi ${options.name},`);
    expect($("body").text()).toContain(options.email);
    expect(html).not.toContain(options.email);
  });
});
