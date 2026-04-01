export type CoverTextLayer = {
  id: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: "normal" | "bold" | "italic" | "bold italic";
  fill: string;
  x: number;
  y: number;
  width: number;
  align: "left" | "center" | "right";
  letterSpacing: number;
  /** Text shadow / glow */
  shadowColor: string;
  shadowBlur: number;
  /** Text outline stroke */
  stroke: string;
  strokeWidth: number;
};

export type CoverFilters = {
  brightness: number;
  contrast: number;
  saturation: number;
};

export type FilterPreset = {
  id: string;
  label: string;
  filters: CoverFilters;
};

export type CoverEditorState = {
  textLayers: CoverTextLayer[];
  selectedLayerId: string | null;
  filters: CoverFilters;
};
