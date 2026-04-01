"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import type { CoverTextLayer, CoverFilters } from "./cover-editor.types";
import { filtersToCss } from "./cover-editor.filters";

/** Canvas dimensions (portrait 2:3, matches SD3 output). */
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;

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

  // Load background image
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

  // Attach transformer to selected node
  useEffect(() => {
    const tr = transformerRef.current;
    const layer = layerRef.current;
    if (!tr || !layer) return;
    if (!selectedLayerId) { tr.nodes([]); tr.getLayer()?.batchDraw(); return; }
    const node = layer.findOne(`#${selectedLayerId}`);
    if (node) {
      tr.nodes([node]);
      tr.getLayer()?.batchDraw();
    } else {
      tr.nodes([]);
    }
  }, [selectedLayerId, textLayers]);

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (e.target === e.target.getStage()) {
        onSelectLayer(null);
      }
    },
    [onSelectLayer]
  );

  const handleDragEnd = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
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
              <KonvaImage
                image={image}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
              />
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
                draggable
                onClick={() => onSelectLayer(layer.id)}
                onTap={() => onSelectLayer(layer.id)}
                onDragEnd={(e) => handleDragEnd(layer.id, e)}
                onTransformEnd={(e) => handleTransformEnd(layer.id, e)}
              />
            ))}
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(_, newBox) => ({
                ...newBox,
                width: Math.max(20, newBox.width),
                height: Math.max(20, newBox.height),
              })}
              enabledAnchors={["middle-left", "middle-right", "bottom-center", "bottom-right"]}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

export { CANVAS_WIDTH, CANVAS_HEIGHT };
