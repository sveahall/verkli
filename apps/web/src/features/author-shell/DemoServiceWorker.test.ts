import { describe, expect, it } from "vitest";

import { isDemoSwHostAllowed } from "./DemoServiceWorker";

describe("isDemoSwHostAllowed", () => {
  it("allows localhost and IPv4/IPv6 loopback", () => {
    expect(isDemoSwHostAllowed("localhost")).toBe(true);
    expect(isDemoSwHostAllowed("127.0.0.1")).toBe(true);
    expect(isDemoSwHostAllowed("::1")).toBe(true);
  });

  it("allows any *.local subdomain (developer machines / mDNS)", () => {
    expect(isDemoSwHostAllowed("verkli.local")).toBe(true);
    expect(isDemoSwHostAllowed("dev.team.local")).toBe(true);
  });

  it("is case-insensitive — hostnames are normalised before matching", () => {
    expect(isDemoSwHostAllowed("LOCALHOST")).toBe(true);
    expect(isDemoSwHostAllowed("MyMachine.LOCAL")).toBe(true);
  });

  it("rejects production-looking hosts", () => {
    expect(isDemoSwHostAllowed("verkli.com")).toBe(false);
    expect(isDemoSwHostAllowed("app.verkli.com")).toBe(false);
    expect(isDemoSwHostAllowed("verkli-web.vercel.app")).toBe(false);
  });

  it("rejects bare 'local' (must be a subdomain of .local)", () => {
    // "local" does NOT end with ".local" — the dot is significant.
    expect(isDemoSwHostAllowed("local")).toBe(false);
  });

  it("rejects deceptive hostnames embedding allowed strings", () => {
    expect(isDemoSwHostAllowed("localhost.example.com")).toBe(false);
    expect(isDemoSwHostAllowed("127.0.0.1.attacker.example")).toBe(false);
    expect(isDemoSwHostAllowed("evil.local.example.com")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isDemoSwHostAllowed("")).toBe(false);
  });
});
