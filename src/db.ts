import Database from "better-sqlite3";
import path from "path";
import { env } from "./env";
import fs from "fs";

// Ensure DATA_DIRECTORY is an absolute path
const dataDir = path.isAbsolute(env.DATA_DIRECTORY) 
  ? env.DATA_DIRECTORY 
  : path.resolve(process.cwd(), env.DATA_DIRECTORY);

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`Created data directory: ${dataDir}`);
} else {
  console.log(`Using data directory: ${dataDir}`);
}

const dbPath = path.join(dataDir, "database.db");
console.log(`Database path: ${dbPath}`);

export const db = new Database(dbPath);

// Enable foreign keys
db.pragma("foreign_keys = ON");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    uploaded_at INTEGER NOT NULL,
    expires_at INTEGER,
    size INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    secret_link TEXT UNIQUE NOT NULL,
    is_private INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_images_expires_at ON images(expires_at);
  CREATE INDEX IF NOT EXISTS idx_documents_expires_at ON documents(expires_at);
  CREATE INDEX IF NOT EXISTS idx_documents_secret_link ON documents(secret_link);
`);

export interface Image {
  id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  uploaded_by: string;
  uploaded_at: number;
  expires_at: number | null;
  size: number;
}

export interface Document {
  id: string;
  title: string;
  content: string;
  secret_link: string;
  is_private: number; // SQLite uses INTEGER for booleans
  created_by: string;
  created_at: number;
  expires_at: number | null;
  updated_at: number;
}

