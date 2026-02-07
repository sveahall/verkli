/**
 * Compatibility re-export.
 * Server/Next usage should resolve here as before.
 * Workers must import from "./workers" to avoid server-only modules.
 */
export * from "./server";
