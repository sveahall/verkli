import { vi } from "vitest";

type TableMock = Record<string, any> | (() => Record<string, any>);

type SupabaseMockOptions = {
  userId?: string | null;
  tables?: Record<string, TableMock>;
};

const FLUENT_METHODS = [
  "select",
  "insert",
  "update",
  "delete",
  "eq",
  "neq",
  "in",
  "is",
  "order",
  "range",
  "limit",
  "maybeSingle",
  "single",
] as const;

export function createChain(overrides: Record<string, any> = {}) {
  const chain: Record<string, any> = {};

  for (const method of FLUENT_METHODS) {
    chain[method] = vi.fn(() => chain);
  }

  return Object.assign(chain, overrides);
}

export function createSupabaseClientMock(options: SupabaseMockOptions = {}) {
  const { userId = null, tables = {} } = options;

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: userId ? { id: userId } : null,
        },
      })),
    },
    from: vi.fn((table: string) => {
      const resolver = tables[table];
      if (!resolver) {
        throw new Error(`Unexpected table: ${table}`);
      }

      return typeof resolver === "function" ? resolver() : resolver;
    }),
  };
}
