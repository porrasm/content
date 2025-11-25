import express from "express";
import path from "path";
import { env } from "./env";
import { setupAuth, optionalAuth, isAuthorized } from "./auth";
import imageRoutes from "./routes/images";
import documentRoutes from "./routes/documents";
import { marked } from "marked";
import { db, Document } from "./db";

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup authentication
setupAuth(app);

// API routes
app.use("/api/images", imageRoutes);
app.use("/api/documents", documentRoutes);

// Serve static files from public directory
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

// API endpoint to get current user
app.get("/api/user", optionalAuth, (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: {
        email: req.user.email,
        name: req.user.name,
        picture: req.user.picture,
      },
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Serve markdown documents
app.get("/documents/:secretLink", optionalAuth, (req, res) => {
  const stmt = db.prepare("SELECT * FROM documents WHERE secret_link = ?");
  const document = stmt.get(req.params.secretLink) as Document | undefined;

  if (!document) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Document Not Found</title>
        <link rel="stylesheet" href="/style.css">
      </head>
      <body>
        <div class="container">
          <h1>Document Not Found</h1>
          <p>The document you're looking for doesn't exist.</p>
        </div>
      </body>
      </html>
    `);
  }

  // Check if expired
  if (document.expires_at && document.expires_at < Date.now()) {
    return res.status(410).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Document Expired</title>
        <link rel="stylesheet" href="/style.css">
      </head>
      <body>
        <div class="container">
          <h1>Document Expired</h1>
          <p>This document has expired and is no longer available.</p>
        </div>
      </body>
      </html>
    `);
  }

  // Check access
  const isPrivate = document.is_private === 1;
  const isAuthorizedUser = req.isAuthenticated() && req.user && isAuthorized(req.user.email);
  const isOwner = req.isAuthenticated() && req.user && document.created_by === req.user.email;

  if (isPrivate && !isOwner) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Access Denied</title>
        <link rel="stylesheet" href="/style.css">
      </head>
      <body>
        <div class="container">
          <h1>Access Denied</h1>
          <p>This document is private. Please <a href="/auth/google">sign in</a> to access it.</p>
        </div>
      </body>
      </html>
    `);
  }

  // Render markdown
  const htmlContent = marked(document.content);

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeHtml(document.title)}</title>
      <link rel="stylesheet" href="/style.css">
      <link rel="stylesheet" href="/markdown.css">
    </head>
    <body>
      <div class="container">
        <header>
          <h1>${escapeHtml(document.title)}</h1>
          ${req.isAuthenticated() ? `<a href="/" class="btn">Dashboard</a>` : ''}
        </header>
        <main class="markdown-content">
          ${htmlContent}
        </main>
      </div>
    </body>
    </html>
  `);
});

// Serve main app (catch-all route for SPA)
// In Express 5, use app.use() for catch-all instead of app.get("*")
app.use(optionalAuth);
app.use((req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

const PORT = env.PORT;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

