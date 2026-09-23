export const BRAND_COLORS = {
  violet: "#907AFF",
  violetHover: "#8069EE",
  violetActive: "#7058DD",
  rose: "#E29ED5",
  roseSoft: "#c4a0e8",
  amber: "#FCC997",
  amberSoft: "#FEE9A3",
} as const;

export const BRAND_GRADIENTS = {
  violetToRose: `linear-gradient(135deg, ${BRAND_COLORS.violet} 0%, ${BRAND_COLORS.rose} 100%)`,
  roseToAmber: `linear-gradient(135deg, ${BRAND_COLORS.rose} 0%, ${BRAND_COLORS.amber} 100%)`,
  amberToSoft: `linear-gradient(135deg, ${BRAND_COLORS.amber} 0%, ${BRAND_COLORS.amberSoft} 100%)`,
  violetToAmber: `linear-gradient(135deg, ${BRAND_COLORS.violet} 0%, ${BRAND_COLORS.amber} 100%)`,
} as const;

export const SHELF_GRADIENT_OPTIONS = [
  BRAND_GRADIENTS.violetToRose,
  BRAND_GRADIENTS.roseToAmber,
  BRAND_GRADIENTS.amberToSoft,
  BRAND_GRADIENTS.violetToAmber,
] as const;
