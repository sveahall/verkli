/**
 * Platform-specific constraints for social publishing.
 */

export type PlatformConstraint = {
  maxCaption: number;
  mediaRequired: boolean;
  publishSupported: boolean;
  rateLimitPerHour: number | null;
};

export const PLATFORM_CONSTRAINTS: Record<string, PlatformConstraint> = {
  instagram: {
    maxCaption: 2200,
    mediaRequired: true,
    publishSupported: false,
    rateLimitPerHour: 25,
  },
  tiktok: {
    maxCaption: 2200,
    mediaRequired: true,
    publishSupported: false,
    rateLimitPerHour: null,
  },
  x: {
    maxCaption: 280,
    mediaRequired: false,
    publishSupported: true,
    rateLimitPerHour: 50,
  },
  email: {
    maxCaption: 50000,
    mediaRequired: false,
    publishSupported: true,
    rateLimitPerHour: null,
  },
};

export const VALID_PLATFORMS = Object.keys(PLATFORM_CONSTRAINTS);

export const PUBLISHABLE_PLATFORMS = Object.entries(PLATFORM_CONSTRAINTS)
  .filter(([, c]) => c.publishSupported)
  .map(([p]) => p);

export function truncateForPlatform(text: string, platform: string): string {
  const constraint = PLATFORM_CONSTRAINTS[platform];
  if (!constraint) return text;
  if (text.length <= constraint.maxCaption) return text;
  return text.slice(0, constraint.maxCaption - 1) + "\u2026";
}

export function validateForPlatform(
  text: string,
  platform: string
): { valid: boolean; error?: string } {
  const constraint = PLATFORM_CONSTRAINTS[platform];
  if (!constraint) return { valid: false, error: "Unknown platform" };
  if (text.length > constraint.maxCaption) {
    return { valid: false, error: `Text exceeds ${constraint.maxCaption} character limit` };
  }
  return { valid: true };
}
