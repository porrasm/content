import express, { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db, Image } from "../db";
import { env } from "../env";
import { requireAuth } from "../auth";

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(env.DATA_DIRECTORY, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const id = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only images are allowed."));
    }
  },
});

// Upload image
router.post("/upload", requireAuth, upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const expiresAt = req.body.expiresAt
    ? new Date(req.body.expiresAt).getTime()
    : null;

  const imageId = path.parse(req.file.filename).name;

  const stmt = db.prepare(`
    INSERT INTO images (id, filename, original_filename, mime_type, uploaded_by, uploaded_at, expires_at, size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    imageId,
    req.file.filename,
    req.file.originalname,
    req.file.mimetype,
    req.user!.email,
    Date.now(),
    expiresAt,
    req.file.size
  );

  res.json({
    id: imageId,
    url: `/api/images/${imageId}`,
    filename: req.file.originalname,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  });
});

// List images (authorized users only)
router.get("/", requireAuth, (req, res) => {
  const stmt = db.prepare(`
    SELECT id, original_filename, uploaded_at, expires_at, size
    FROM images
    WHERE uploaded_by = ?
    ORDER BY uploaded_at DESC
  `);

  const images = stmt.all(req.user!.email) as Array<{
    id: string;
    original_filename: string;
    uploaded_at: number;
    expires_at: number | null;
    size: number;
  }>;

  res.json(
    images.map((img) => ({
      id: img.id,
      filename: img.original_filename,
      url: `/api/images/${img.id}`,
      uploadedAt: new Date(img.uploaded_at).toISOString(),
      expiresAt: img.expires_at ? new Date(img.expires_at).toISOString() : null,
      size: img.size,
    }))
  );
});

// Serve image
router.get("/:id", (req, res) => {
  const stmt = db.prepare("SELECT * FROM images WHERE id = ?");
  const image = stmt.get(req.params.id) as Image | undefined;

  if (!image) {
    return res.status(404).json({ error: "Image not found" });
  }

  // Check if expired
  if (image.expires_at && image.expires_at < Date.now()) {
    return res.status(410).json({ error: "Image has expired" });
  }

  const filePath = path.join(uploadsDir, image.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Image file not found" });
  }

  res.setHeader("Content-Type", image.mime_type);
  res.setHeader("Content-Disposition", `inline; filename="${image.original_filename}"`);
  res.sendFile(path.resolve(filePath));
});

// Delete image
router.delete("/:id", requireAuth, (req, res) => {
  const stmt = db.prepare("SELECT * FROM images WHERE id = ?");
  const image = stmt.get(req.params.id) as Image | undefined;

  if (!image) {
    return res.status(404).json({ error: "Image not found" });
  }

  if (image.uploaded_by !== req.user!.email) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Delete file
  const filePath = path.join(uploadsDir, image.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Delete from database
  const deleteStmt = db.prepare("DELETE FROM images WHERE id = ?");
  deleteStmt.run(req.params.id);

  res.json({ success: true });
});

export default router;

