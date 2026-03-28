export interface OfferTexts {
  title: string;
  publicPrice: string;
  payOnly: string;
  offerUntil: string;
}

export interface BaseElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

export interface ImageElement extends BaseElement {
  type: "image";
  catalogItemId: string;
  storedRelativePath: string;
  badge?: string;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontSize: number;
  fontStyle: string;
  fill: string;
  align: string;
  role?: "title" | "publicPrice" | "payOnly" | "offerUntil";
}

export type CanvasElement = ImageElement | TextElement;

export interface Page {
  pageId: string;
  name: string;
  preset: string;
  elements: CanvasElement[];
  offerTexts: OfferTexts;
  background: string;
}

export interface Project {
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  defaultPreset: string;
  pages: Page[];
}
