export interface CatalogItem {
  id: string;
  code: string;
  name: string;
  category: string;
  originalFilename: string;
  storedFilename: string;
  storedRelativePath: string;
  createdAt: string;
}

export const CATEGORIES = [
  "Fragancias",
  "Cuidado Personal",
  "Maquillaje",
  "Cuidado del Rostro",
  "Bijutería",
  "Miscelanía",
] as const;

export type Category = (typeof CATEGORIES)[number];
