// Re-export everything from the shared print-on-demand module.
// This file exists so that author-side relative imports continue to work.
export {
  CPI_POD_PRINT_SPEC,
  type BookFormat,
  type PrintOnDemandEditionLimit,
  type PrintOnDemandSettings,
  POD_PRICE_FLOOR,
  POD_PRODUCTION_COST,
  POD_SHIPPING_COST_SE,
  DEFAULT_PRINT_ON_DEMAND_SETTINGS,
  type PrintChecklistStatus,
  type PrintChecklistItem,
  normalizePrintOnDemandSettings,
  extractIsbnCandidate,
  roundUpToEven,
  estimatePrintInteriorPages,
  buildPrintFileStem,
  buildPrintChecklist,
  buildCpiMasteringPreview,
} from "@/lib/print-on-demand";
