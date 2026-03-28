export interface CanvasPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const PRESETS: CanvasPreset[] = [
  { id: "story", label: "Story (1080×1920)", width: 1080, height: 1920 },
  { id: "whatsapp_4_5", label: "WhatsApp 4:5 (1080×1350)", width: 1080, height: 1350 },
];

export function getPreset(id: string): CanvasPreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}
