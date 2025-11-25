import express, { Request, Response } from "express";
import crypto from "crypto";
import { db, Document } from "../db";
import { requireAuth, optionalAuth } from "../auth";
import { z } from "zod";

const router = express.Router();

const createDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string(),
  isPrivate: z.boolean().optional().default(true),
  expiresAt: z.iso.datetime().optional().nullable(),
});

const updateDocumentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  isPrivate: z.boolean().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

// Create document
router.post("/", requireAuth, (req: express.Request, res: express.Response) => {
  try {
    const data = createDocumentSchema.parse(req.body);
    const id = crypto.randomUUID();
    const secretLink = crypto.randomBytes(16).toString("hex");
    const now = Date.now();
    const expiresAt = data.expiresAt ? new Date(data.expiresAt).getTime() : null;

    const stmt = db.prepare(`
      INSERT INTO documents (id, title, content, secret_link, is_private, created_by, created_at, expires_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.title,
      data.content,
      secretLink,
      data.isPrivate ? 1 : 0,
      req.user!.email,
      now,
      expiresAt,
      now
    );

    res.json({
      id,
      title: data.title,
      secretLink,
      url: `/documents/${secretLink}`,
      isPrivate: data.isPrivate,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid input", details: error.issues });
    }
    res.status(500).json({ error: "Failed to create document" });
  }
});

// List documents (authorized users only)
router.get("/", requireAuth, (req, res) => {
  const stmt = db.prepare(`
    SELECT id, title, secret_link, is_private, created_at, expires_at, updated_at
    FROM documents
    WHERE created_by = ?
    ORDER BY updated_at DESC
  `);

  const documents = stmt.all(req.user!.email) as Array<{
    id: string;
    title: string;
    secret_link: string;
    is_private: number;
    created_at: number;
    expires_at: number | null;
    updated_at: number;
  }>;

  res.json(
    documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      secretLink: doc.secret_link,
      url: `/documents/${doc.secret_link}`,
      isPrivate: doc.is_private === 1,
      createdAt: new Date(doc.created_at).toISOString(),
      expiresAt: doc.expires_at ? new Date(doc.expires_at).toISOString() : null,
      updatedAt: new Date(doc.updated_at).toISOString(),
    }))
  );
});

// Get document by ID (for editing, authorized users only)
router.get("/id/:id", requireAuth, (req: express.Request, res: express.Response) => {
  const stmt = db.prepare("SELECT * FROM documents WHERE id = ?");
  const document = stmt.get(req.params.id) as Document | undefined;

  if (!document) {
    return res.status(404).json({ error: "Document not found" });
  }

  if (document.created_by !== req.user!.email) {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.json({
    id: document.id,
    title: document.title,
    content: document.content,
    isPrivate: document.is_private === 1,
    createdAt: new Date(document.created_at).toISOString(),
    expiresAt: document.expires_at ? new Date(document.expires_at).toISOString() : null,
    updatedAt: new Date(document.updated_at).toISOString(),
  });
});

// Get document by secret link (public or authorized)
router.get("/:secretLink", optionalAuth, (req: express.Request, res: express.Response) => {
  const stmt = db.prepare("SELECT * FROM documents WHERE secret_link = ?");
  const document = stmt.get(req.params.secretLink) as Document | undefined;

  if (!document) {
    return res.status(404).json({ error: "Document not found" });
  }

  // Check if expired
  if (document.expires_at && document.expires_at < Date.now()) {
    return res.status(410).json({ error: "Document has expired" });
  }

  // Check access
  const isPrivate = document.is_private === 1;
  const isAuthorized = req.isAuthenticated() && req.user && document.created_by === req.user.email;

  if (isPrivate && !isAuthorized) {
    return res.status(403).json({ error: "This document is private" });
  }

  res.json({
    id: document.id,
    title: document.title,
    content: document.content,
    isPrivate,
    createdAt: new Date(document.created_at).toISOString(),
    expiresAt: document.expires_at ? new Date(document.expires_at).toISOString() : null,
    updatedAt: new Date(document.updated_at).toISOString(),
  });
});

// Update document content only (for editing)
const updateContentSchema = z.object({
  content: z.string(),
});

router.patch("/:id/content", requireAuth, (req: express.Request, res: express.Response) => {
  try {
    const data = updateContentSchema.parse(req.body);
    const stmt = db.prepare("SELECT * FROM documents WHERE id = ?");
    const document = stmt.get(req.params.id) as Document | undefined;

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (document.created_by !== req.user!.email) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updateStmt = db.prepare(`
      UPDATE documents
      SET content = ?,
          updated_at = ?
      WHERE id = ?
    `);

    updateStmt.run(
      data.content,
      Date.now(),
      req.params.id
    );

    res.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid input", details: error.issues });
    }
    res.status(500).json({ error: "Failed to update document" });
  }
});

// Update document
router.put("/:id", requireAuth, (req: express.Request, res: express.Response) => {
  try {
    const data = updateDocumentSchema.parse(req.body);
    const stmt = db.prepare("SELECT * FROM documents WHERE id = ?");
    const document = stmt.get(req.params.id) as Document | undefined;

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (document.created_by !== req.user!.email) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const expiresAt = data.expiresAt !== undefined
      ? (data.expiresAt ? new Date(data.expiresAt).getTime() : null)
      : document.expires_at;

    const updateStmt = db.prepare(`
      UPDATE documents
      SET title = COALESCE(?, title),
          content = COALESCE(?, content),
          is_private = COALESCE(?, is_private),
          expires_at = ?,
          updated_at = ?
      WHERE id = ?
    `);

    updateStmt.run(
      data.title ?? null,
      data.content ?? null,
      data.isPrivate !== undefined ? (data.isPrivate ? 1 : 0) : null,
      expiresAt,
      Date.now(),
      req.params.id
    );

    res.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid input", details: error.issues });
    }
    res.status(500).json({ error: "Failed to update document" });
  }
});

// Delete document
router.delete("/:id", requireAuth, (req: express.Request, res: express.Response) => {
  const stmt = db.prepare("SELECT * FROM documents WHERE id = ?");
  const document = stmt.get(req.params.id) as Document | undefined;

  if (!document) {
    return res.status(404).json({ error: "Document not found" });
  }

  if (document.created_by !== req.user!.email) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const deleteStmt = db.prepare("DELETE FROM documents WHERE id = ?");
  deleteStmt.run(req.params.id);

  res.json({ success: true });
});

export default router;

