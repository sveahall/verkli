type VideoScene = {
  id: string;
  title: string;
  startMs: number;
  durationMs: number;
  visual: string;
};

type VideoPreview = {
  id: string;
  label: string;
  durationMs: number;
  createdAt: string;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstWords(value: string, count: number): string {
  const words = normalizeWhitespace(value).split(" ").filter(Boolean);
  return words.slice(0, count).join(" ");
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function generateScriptFromSelection(selectedText: string): string {
  const normalized = normalizeWhitespace(selectedText);
  if (!normalized) return "";

  const opening = firstWords(normalized, 18);
  const conflict = firstWords(normalized.split(".").slice(1).join(".") || normalized, 20);
  const payoff = firstWords(normalized.slice(Math.floor(normalized.length / 2)), 18);

  return [
    `Hook: ${opening}.`,
    `Beat 1: ${conflict}.`,
    `Beat 2: ${payoff}.`,
    "CTA: Continue reading to uncover what happens next.",
  ].join("\n");
}

export function generateScenesFromScript(script: string): VideoScene[] {
  const lines = script
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length > 0);

  const lineA = lines[0] ?? "Hook";
  const lineB = lines[1] ?? lineA;
  const lineC = lines[2] ?? lineB;
  const source = `${lineA}|${lineB}|${lineC}`;
  const hash = stableHash(source);

  return [
    {
      id: `scene-${hash}-1`,
      title: "Scene 1",
      startMs: 0,
      durationMs: 4000,
      visual: `Close-up on turning pages. ${lineA}`,
    },
    {
      id: `scene-${hash}-2`,
      title: "Scene 2",
      startMs: 4000,
      durationMs: 5000,
      visual: `Character silhouette in motion. ${lineB}`,
    },
    {
      id: `scene-${hash}-3`,
      title: "Scene 3",
      startMs: 9000,
      durationMs: 5000,
      visual: `Final reveal with title card. ${lineC}`,
    },
  ];
}

export function createRenderPreview(input: {
  selectedText: string;
  script: string;
  scenes: VideoScene[];
}): VideoPreview {
  const token = stableHash(
    `${normalizeWhitespace(input.selectedText)}|${normalizeWhitespace(input.script)}|${input.scenes
      .map((scene) => `${scene.id}:${scene.durationMs}`)
      .join(",")}`
  );
  const durationMs = input.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);

  return {
    id: `preview-${token}`,
    label: "Mock Render Ready",
    durationMs,
    createdAt: new Date().toISOString(),
  };
}
