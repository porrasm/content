import { db } from "./db";
import fs from "fs";
import path from "path";
import { env } from "./env";

const now = Date.now();

// Delete expired images
const expiredImages = db
  .prepare("SELECT id, filename FROM images WHERE expires_at IS NOT NULL AND expires_at < ?")
  .all(now) as Array<{ id: string; filename: string }>;

// Ensure DATA_DIRECTORY is an absolute path
const dataDir = path.isAbsolute(env.DATA_DIRECTORY) 
  ? env.DATA_DIRECTORY 
  : path.resolve(process.cwd(), env.DATA_DIRECTORY);

const uploadsDir = path.join(dataDir, "uploads");

for (const image of expiredImages) {
  const filePath = path.join(uploadsDir, image.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`Deleted expired image: ${image.filename}`);
  }
  db.prepare("DELETE FROM images WHERE id = ?").run(image.id);
}

// Delete expired documents
const expiredDocuments = db
  .prepare("SELECT id FROM documents WHERE expires_at IS NOT NULL AND expires_at < ?")
  .all(now) as Array<{ id: string }>;

for (const doc of expiredDocuments) {
  db.prepare("DELETE FROM documents WHERE id = ?").run(doc.id);
  console.log(`Deleted expired document: ${doc.id}`);
}

console.log(`Cleanup complete. Deleted ${expiredImages.length} images and ${expiredDocuments.length} documents.`);

