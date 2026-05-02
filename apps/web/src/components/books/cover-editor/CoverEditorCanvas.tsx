"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Text, Transformer, Line } from "react-konva";
import type Konva from "konva";
import type { CoverTextLayer, CoverFilters } from "./cover-editor.types";
import { filtersToCss } from "./cover-editor.filters";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "./cover-editor.constants";
const SNAP_THRESHOLD = 8;
const GUIDE_COLOR = "#907AFF";

type SnapGuide = { points: number[]; orientation: "h" | "v" };

function getSnapGuides(node: Konva.Node): SnapGuide[] {
  const guides: SnapGuide[] = [];
  const cx = node.x() + node.width() * node.scaleX() / 2;
  const cy = node.y() + node.height() * node.scaleY() / 2;
  const canvasCx = CANVAS_WIDTH / 2;
  const canvasCy = CANVAS_HEIGHT / 2;

  if (Math.abs(cx - canvasCx) < SNAP_THRESHOLD) {
    guides.push({ points: [canvasCx, 0, canvasCx, CANVAS_HEIGHT], orientation: "v" });
  }
  if (Math.abs(cy - canvasCy) < SNAP_THRESHOLD) {
    guides.push({ points: [0, canvasCy, CANVAS_WIDTH, canvasCy], orientation: "h" });
  }
  return guides;
}

type CoverEditorCanvasProps = {
  imageUrl: string | null;
  textLayers: CoverTextLayer[];
  selectedLayerId: string | null;
  filters: CoverFilters;
  onSelectLayer: (id: string | null) => void;
  onUpdateLayer: (id: string, patch: Partial<CoverTextLayer>) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
};

export default function CoverEditorCanvas({
  imageUrl,
  textLayers,
  selectedLayerId,
  filters,
  onSelectLayer,
  onUpdateLayer,
  stageRef,
}: CoverEditorCanvasProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);

  useEffect(() => {
    if (!imageUrl) return;
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => { if (!cancelled) setImage(img); };
    img.onerror = () => { if (!cancelled) setImage(null); };
    return () => { cancelled = true; };
  }, [imageUrl]);

  useEffect(() => {
    const tr = transformerRef.current;
    const layer = layerRef.current;
    if (!tr || !layer) return;
    if (!selectedLayerId) { tr.nodes([]); tr.getLayer()?.batchDraw(); return; }
    const node = layer.findOne(`#${selectedLayerId}`);
    if (node) { tr.nodes([node]); tr.getLayer()?.batchDraw(); }
    else { tr.nodes([]); }
  }, [selectedLayerId, textLayers]);

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (e.target === e.target.getStage()) onSelectLayer(null);
    },
    [onSelectLayer]
  );

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      const snapGuides = getSnapGuides(node);
      setGuides(snapGuides);

      // Snap to center
      const cx = node.x() + node.width() * node.scaleX() / 2;
      const cy = node.y() + node.height() * node.scaleY() / 2;
      const canvasCx = CANVAS_WIDTH / 2;
      const canvasCy = CANVAS_HEIGHT / 2;

      if (Math.abs(cx - canvasCx) < SNAP_THRESHOLD) {
        node.x(canvasCx - node.width() * node.scaleX() / 2);
      }
      if (Math.abs(cy - canvasCy) < SNAP_THRESHOLD) {
        node.y(canvasCy - node.height() * node.scaleY() / 2);
      }
    },
    []
  );

  const handleDragEnd = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      setGuides([]);
      onUpdateLayer(id, { x: e.target.x(), y: e.target.y() });
    },
    [onUpdateLayer]
  );

  const handleTransformEnd = useCallback(
    (id: string, e: Konva.KonvaEventObject<Event>) => {
      const node = e.target as Konva.Text;
      onUpdateLayer(id, {
        x: node.x(),
        y: node.y(),
        width: Math.max(20, node.width() * node.scaleX()),
        fontSize: Math.max(8, Math.round(node.fontSize() * node.scaleY())),
      });
      node.scaleX(1);
      node.scaleY(1);
    },
    [onUpdateLayer]
  );

  const cssFilter = filtersToCss(filters);
  const hasFilter = cssFilter !== "brightness(1) contrast(1) saturate(1)";

  return (
    <div className="relative flex items-center justify-center">
      <div
        className="overflow-hidden rounded-xl shadow-[0_8px_40px_rgba(0,0,0,0.25)]"
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, filter: hasFilter ? cssFilter : undefined }}
      >
        <Stage
          ref={stageRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={handleStageClick}
          onTap={handleStageClick}
        >
          <Layer>
            {image && (
              <KonvaImage image={image} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
            )}
          </Layer>
          <Layer ref={layerRef}>
            {textLayers.map((layer) => (
              <Text
                key={layer.id}
                id={layer.id}
                text={layer.text}
                fontFamily={layer.fontFamily}
                fontSize={layer.fontSize}
                fontStyle={layer.fontStyle}
                fill={layer.fill}
                x={layer.x}
                y={layer.y}
                width={layer.width}
                align={layer.align}
                letterSpacing={layer.letterSpacing}
                shadowColor={layer.shadowColor}
                shadowBlur={layer.shadowBlur}
                shadowOffsetX={0}
                shadowOffsetY={2}
                stroke={layer.stroke || undefined}
                strokeWidth={layer.strokeWidth || undefined}
                draggable
                onClick={() => onSelectLayer(layer.id)}
                onTap={() => onSelectLayer(layer.id)}
                onDragMove={handleDragMove}
                onDragEnd={(e) => handleDragEnd(layer.id, e)}
                onTransformEnd={(e) => handleTransformEnd(layer.id, e)}
              />
            ))}
            <Transformer
              ref={transformerRef}
              borderStroke={GUIDE_COLOR}
              anchorFill="#fff"
              anchorStroke={GUIDE_COLOR}
              anchorSize={8}
              anchorCornerRadius={4}
              boundBoxFunc={(_, newBox) => ({
                ...newBox,
                width: Math.max(20, newBox.width),
                height: Math.max(20, newBox.height),
              })}
              enabledAnchors={["middle-left", "middle-right", "bottom-center", "bottom-right"]}
            />
          </Layer>
          {/* Snap guides layer */}
          <Layer listening={false}>
            {guides.map((g, i) => (
              <Line
                key={i}
                points={g.points}
                stroke={GUIDE_COLOR}
                strokeWidth={1}
                dash={[6, 4]}
                opacity={0.7}
              />
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
