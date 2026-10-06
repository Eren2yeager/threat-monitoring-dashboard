export const MODEL_CLASSES = [
  "bear",
  "cat",
  "cattle",
  "crocodile",
  "deer",
  "dog",
  "elephant",
  "fox",
  "hyena",
  "jackal",
  "leopard",
  "lion",
  "monkey",
  "person",
  "rabbit",
  "snake",
  "tiger",
  "weasel",
  "wild_boar",
  "wolf",
] as const;

export type ModelClass = (typeof MODEL_CLASSES)[number];
export type ThreatLevel = "Low" | "Medium" | "High";

export const THREAT_LEVELS: ThreatLevel[] = ["Low", "Medium", "High"];

export function isModelClass(value: unknown): value is ModelClass {
  return typeof value === "string" && MODEL_CLASSES.includes(value as ModelClass);
}

export function isThreatLevel(value: unknown): value is ThreatLevel {
  return typeof value === "string" && THREAT_LEVELS.includes(value as ThreatLevel);
}

export function formatClassName(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
