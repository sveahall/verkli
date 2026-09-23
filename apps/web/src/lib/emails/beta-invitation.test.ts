import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import {
  buildBetaInvitationHtml,
  buildBetaInvitationSubject,
  buildBetaInvitationText,
} from "./beta-invitation";

const email = "invited+beta@example.com";

describe("beta invitation", () => {
  it("announces selection in the subject", () => {
    expect(buildBetaInvitationSubject()).toBe("You're in — welcome to the Verkli beta");
  });

  it("keeps the existing options contract as a new author invitation", () => {
    const $ = load(buildBetaInvitationHtml({ email }));

    expect($("a[href='https://www.verkli.com/author/signup']").text()).toBe("Create your account");
    expect($("body").text()).toContain("author beta");
  });

  it.each(["author", "reader"] as const)("sends a new %s to signup with the exact invited email", (audience) => {
    const options = { email, audience, accountExists: false };
    const $ = load(buildBetaInvitationHtml(options));
    const text = buildBetaInvitationText(options);

    expect($("a[href]").map((_, link) => $(link).attr("href")).get()).toContain(`https://www.verkli.com/${audience}/signup`);
    for (const content of [$("body").text(), text]) {
      expect(content).toContain(`using exactly ${email}`);
      expect(content).toMatch(/choose a password/i);
      expect(content).toMatch(/confirm your email/i);
      expect(content).not.toContain("You already have");
    }
    expect(text).toContain(`https://www.verkli.com/${audience}/signup`);
  });

  it.each(["author", "reader"] as const)("sends an existing %s to signin with password recovery guidance", (audience) => {
    const options = { email, audience, accountExists: true };
    const $ = load(buildBetaInvitationHtml(options));
    const text = buildBetaInvitationText(options);

    expect($("a[href]").map((_, link) => $(link).attr("href")).get()).toContain(`https://www.verkli.com/${audience}/signin`);
    for (const content of [$("body").text(), text]) {
      expect(content).toContain(`Sign in using exactly ${email}`);
      expect(content).toContain("Forgot password");
      expect(content).toContain("haven't set a password");
      expect(content).not.toMatch(/create your account|sign up|signup/i);
    }
    expect(text).toContain(`https://www.verkli.com/${audience}/signin`);
  });

  it("preserves the author Pro promise with explicit generation limits and first steps", () => {
    const html = buildBetaInvitationHtml({ email });
    for (const content of [load(html)("body").text(), buildBetaInvitationText({ email })]) {
      expect(content).toMatch(/Verkli Pro for free until public launch/i);
      expect(content).toMatch(/generation.*usage limits/i);
      expect(content).toMatch(/create or import a draft/i);
      expect(content).toContain("hello@verkli.com");
      expect(content).not.toMatch(/1,?200|EUR|unlimited|physical|reply to this email/i);
    }
    expect(html).toContain('href="mailto:hello@verkli.com"');
  });

  it("gives readers reading steps without author benefits", () => {
    const options = { email, audience: "reader" as const };
    for (const content of [load(buildBetaInvitationHtml(options))("body").text(), buildBetaInvitationText(options)]) {
      expect(content).toContain("reader beta");
      expect(content).toMatch(/browse the available books/i);
      expect(content).toMatch(/book preview/i);
      expect(content).toContain("hello@verkli.com");
      expect(content).not.toMatch(/Verkli Pro|author workspace|generation|translation|marketing tools/i);
    }
  });

  it("escapes supplied name and email without changing the plain-text values", () => {
    const options = { email: "<email>&\"'@example.com", name: "  <script>alert('name')</script> & \"Sam\"  " };
    const html = buildBetaInvitationHtml(options);
    const $ = load(html);

    expect($("script")).toHaveLength(0);
    expect($("body").text()).toContain(`Hi ${options.name.trim()},`);
    expect($("body").text()).toContain(options.email);
    expect(html).not.toContain(options.email);
    expect(buildBetaInvitationText(options)).toContain(`Hi ${options.name.trim()},`);
    expect(buildBetaInvitationText(options)).toContain(options.email);
  });

  it("uses a friendly greeting for an empty name", () => {
    expect(buildBetaInvitationHtml({ email, name: "  " })).toContain("Hi there,");
    expect(buildBetaInvitationText({ email, name: null })).toContain("Hi there,");
  });
});
