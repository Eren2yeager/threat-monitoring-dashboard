import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/wildlife_dashboard";

declare global {
  var wildlifeMongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise() {
  if (!globalThis.wildlifeMongoClientPromise) {
    globalThis.wildlifeMongoClientPromise = new MongoClient(uri, {
      serverSelectionTimeoutMS: 1800,
      maxPoolSize: 10,
    }).connect();
  }
  return globalThis.wildlifeMongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  const configuredDb = process.env.MONGODB_DB;
  return configuredDb ? client.db(configuredDb) : client.db();
}
