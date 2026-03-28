import { useRef, useState, useCallback } from "react";
import { Stage, Layer, Rect, Text } from "react-konva";
import Konva from "konva";
import { invoke } from "@tauri-apps/api/tauri";
import { PRESETS, getPreset } from "../presets";
import "./Editor.css";

export default function Editor() {
  const [presetId, setPresetId] = useState("story");
  const stageRef = useRef<Konva.Stage>(null);

  const preset = getPreset(presetId);

  // Calculate fit scale to show canvas in viewport
  const viewportWidth = window.innerWidth - 240; // leave space for sidebar
  const viewportHeight = window.innerHeight - 120; // navbar + toolbar
  const scale = Math.min(
    viewportWidth / preset.width,
    viewportHeight / preset.height
  );

  const stageWidth = preset.width * scale;
  const stageHeight = preset.height * scale;

  const handleExport = useCallback(async () => {
    if (!stageRef.current) return;
    const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 });
    try {
      await invoke("save_export", { dataUrl, filename: `export_${presetId}_${Date.now()}.png` });
      alert("¡Exportación guardada en la carpeta exports/!");
    } catch (err) {
      console.error("Error exportando:", err);
      alert("Error al exportar: " + String(err));
    }
  }, [presetId]);

  return (
    <div className="editor-layout">
      <div className="editor-sidebar">
        <h2>Editor</h2>
        <div className="form-group">
          <label>Preset de lienzo</label>
          <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="preset-info">
          {preset.width} × {preset.height} px
        </div>
        <button className="btn-export" onClick={handleExport}>
          Exportar PNG
        </button>
      </div>
      <div className="editor-canvas-area">
        <Stage
          ref={stageRef}
          width={stageWidth}
          height={stageHeight}
          scaleX={scale}
          scaleY={scale}
        >
          <Layer>
            {/* Background */}
            <Rect
              x={0}
              y={0}
              width={preset.width}
              height={preset.height}
              fill="#16213e"
            />
            {/* Title text */}
            <Text
              text="Editor Paquetes"
              x={0}
              y={preset.height / 2 - 40}
              width={preset.width}
              align="center"
              fontSize={80}
              fill="#e94560"
              fontStyle="bold"
            />
            <Text
              text={`${preset.width} × ${preset.height}`}
              x={0}
              y={preset.height / 2 + 60}
              width={preset.width}
              align="center"
              fontSize={40}
              fill="#a0a0b0"
            />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
