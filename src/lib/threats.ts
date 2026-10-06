import type { Collection, Db, Document } from "mongodb";
import { MODEL_CLASSES, type ModelClass, type ThreatLevel } from "./classes";

export type ClassThreat = {
  name: ModelClass;
  level: ThreatLevel;
  updatedAt: Date;
};

export function defaultThreats(now = new Date()): ClassThreat[] {
  return MODEL_CLASSES.map((name) => ({ name, level: "Medium", updatedAt: now }));
}

export async function ensureThreatClasses(db: Db): Promise<Collection<ClassThreat & Document>> {
  const collection = db.collection<ClassThreat & Document>("classThreats");
  const operations = MODEL_CLASSES.map((name) => ({
    updateOne: {
      filter: { name },
      update: { $setOnInsert: { name, level: "Medium" as ThreatLevel, updatedAt: new Date() } },
      upsert: true,
    },
  }));
  await collection.bulkWrite(operations, { ordered: false });
  return collection;
}

export async function readThreatLevels(db: Db, seedMissing = true): Promise<Record<ModelClass, ThreatLevel>> {
  const collection = seedMissing
    ? await ensureThreatClasses(db)
    : db.collection<ClassThreat & Document>("classThreats");
  const rows = await collection.find({}, { projection: { name: 1, level: 1 } }).toArray();
  const levels = Object.fromEntries(MODEL_CLASSES.map((name) => [name, "Medium"])) as Record<ModelClass, ThreatLevel>;
  for (const row of rows) {
    if (MODEL_CLASSES.includes(row.name as ModelClass) && ["Low", "Medium", "High"].includes(row.level)) {
      levels[row.name as ModelClass] = row.level;
    }
  }
  return levels;
}

export async function setThreatLevel(db: Db, name: ModelClass, level: ThreatLevel) {
  const collection = await ensureThreatClasses(db);
  await collection.updateOne({ name }, { $set: { level, updatedAt: new Date() } }, { upsert: true });
}

export type { Db };
