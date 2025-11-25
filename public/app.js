let currentUser = null;

// Check authentication status
async function checkAuth() {
  try {
    const response = await fetch("/api/user");
    const data = await response.json();
    if (data.authenticated) {
      currentUser = data.user;
      showDashboard();
    } else {
      showWelcome();
    }
  } catch (error) {
    console.error("Auth check failed:", error);
    showWelcome();
  }
}

function showWelcome() {
  document.getElementById("dashboard").style.display = "none";
  document.getElementById("welcome").style.display = "block";
  document.getElementById("user-info").style.display = "none";
  document.getElementById("login-btn").style.display = "inline-block";
}

function showDashboard() {
  document.getElementById("welcome").style.display = "none";
  document.getElementById("dashboard").style.display = "block";
  document.getElementById("user-info").style.display = "flex";
  document.getElementById("login-btn").style.display = "none";
  
  if (currentUser) {
    document.getElementById("user-name").textContent = currentUser.name || currentUser.email;
  }
  
  loadImages();
  loadDocuments();
}

// Tab switching
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    
    btn.classList.add("active");
    document.getElementById(`${tab}-tab`).classList.add("active");
  });
});

// Image upload
document.getElementById("upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const fileInput = document.getElementById("image-file");
  const expiresInput = document.getElementById("image-expires");
  
  if (!fileInput.files[0]) {
    showMessage("Please select an image", "error");
    return;
  }
  
  const formData = new FormData();
  formData.append("image", fileInput.files[0]);
  if (expiresInput.value) {
    formData.append("expiresAt", new Date(expiresInput.value).toISOString());
  }
  
  try {
    const response = await fetch("/api/images/upload", {
      method: "POST",
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Upload failed");
    }
    
    const data = await response.json();
    showMessage(`Image uploaded! URL: ${data.url}`, "success");
    fileInput.value = "";
    expiresInput.value = "";
    loadImages();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

// Load images
async function loadImages() {
  try {
    const response = await fetch("/api/images");
    if (!response.ok) throw new Error("Failed to load images");
    
    const images = await response.json();
    const container = document.getElementById("images-list");
    
    if (images.length === 0) {
      container.innerHTML = "<p style='color: var(--text-secondary);'>No images uploaded yet.</p>";
      return;
    }
    
    container.innerHTML = images.map(img => `
      <div class="image-card">
        <img src="${img.url}" alt="${img.filename}" loading="lazy">
        <div class="image-info">
          <div>${img.filename}</div>
          <div>${formatDate(img.uploadedAt)}</div>
          ${img.expiresAt ? `<div>Expires: ${formatDate(img.expiresAt)}</div>` : ""}
        </div>
        <div class="image-actions">
          <a href="${img.url}" target="_blank" class="btn">View</a>
          <button onclick="copyUrl('${img.url}')" class="btn">Copy URL</button>
          <button onclick="deleteImage('${img.id}')" class="btn btn-danger">Delete</button>
        </div>
      </div>
    `).join("");
  } catch (error) {
    console.error("Failed to load images:", error);
  }
}

// Delete image
async function deleteImage(id) {
  if (!confirm("Are you sure you want to delete this image?")) return;
  
  try {
    const response = await fetch(`/api/images/${id}`, {
      method: "DELETE",
    });
    
    if (!response.ok) throw new Error("Failed to delete image");
    
    showMessage("Image deleted", "success");
    loadImages();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

// Copy URL
function copyUrl(url) {
  navigator.clipboard.writeText(window.location.origin + url);
  showMessage("URL copied to clipboard!", "success");
}

// Document creation
document.getElementById("document-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const title = document.getElementById("doc-title").value;
  const content = document.getElementById("doc-content").value;
  const isPrivate = document.getElementById("doc-private").checked;
  const expires = document.getElementById("doc-expires").value;
  
  try {
    const response = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        content,
        isPrivate,
        expiresAt: expires ? new Date(expires).toISOString() : null,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create document");
    }
    
    const data = await response.json();
    showMessage(`Document created! Link: ${window.location.origin}${data.url}`, "success");
    document.getElementById("document-form").reset();
    document.getElementById("doc-private").checked = true;
    loadDocuments();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

// Load documents
async function loadDocuments() {
  try {
    const response = await fetch("/api/documents");
    if (!response.ok) throw new Error("Failed to load documents");
    
    const documents = await response.json();
    const container = document.getElementById("documents-list");
    
    if (documents.length === 0) {
      container.innerHTML = "<p style='color: var(--text-secondary);'>No documents created yet.</p>";
      return;
    }
    
    container.innerHTML = documents.map(doc => `
      <div class="document-card">
        <h3>${escapeHtml(doc.title)}</h3>
        <div class="doc-meta">
          <div>Created: ${formatDate(doc.createdAt)}</div>
          <div>Updated: ${formatDate(doc.updatedAt)}</div>
          ${doc.expiresAt ? `<div>Expires: ${formatDate(doc.expiresAt)}</div>` : ""}
          <div>${doc.isPrivate ? "🔒 Private" : "🌐 Public"}</div>
        </div>
        <div class="doc-link">
          <strong>Link:</strong> ${window.location.origin}${doc.url}
        </div>
        <div class="doc-actions">
          <a href="${doc.url}" target="_blank" class="btn">View</a>
          <button onclick="editDocument('${doc.id}')" class="btn">Edit</button>
          <button onclick="copyUrl('${doc.url}')" class="btn">Copy Link</button>
          <button onclick="deleteDocument('${doc.id}')" class="btn btn-danger">Delete</button>
        </div>
      </div>
    `).join("");
  } catch (error) {
    console.error("Failed to load documents:", error);
  }
}

// Edit document
let editingDocumentId = null;

async function editDocument(id) {
  editingDocumentId = id;
  
  try {
    const response = await fetch(`/api/documents/id/${id}`);
    if (!response.ok) throw new Error("Failed to load document");
    
    const doc = await response.json();
    document.getElementById("edit-doc-content").value = doc.content;
    document.getElementById("edit-modal").style.display = "flex";
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function closeEditModal() {
  document.getElementById("edit-modal").style.display = "none";
  editingDocumentId = null;
  document.getElementById("edit-doc-content").value = "";
}

// Edit document form submission
document.getElementById("edit-document-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  if (!editingDocumentId) return;
  
  const content = document.getElementById("edit-doc-content").value;
  
  try {
    const response = await fetch(`/api/documents/${editingDocumentId}/content`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update document");
    }
    
    showMessage("Document updated successfully", "success");
    closeEditModal();
    loadDocuments();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

// Close modal when clicking outside
document.getElementById("edit-modal").addEventListener("click", (e) => {
  if (e.target.id === "edit-modal") {
    closeEditModal();
  }
});

// Delete document
async function deleteDocument(id) {
  if (!confirm("Are you sure you want to delete this document?")) return;
  
  try {
    const response = await fetch(`/api/documents/${id}`, {
      method: "DELETE",
    });
    
    if (!response.ok) throw new Error("Failed to delete document");
    
    showMessage("Document deleted", "success");
    loadDocuments();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

// Utility functions
function formatDate(dateString) {
  return new Date(dateString).toLocaleString();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showMessage(message, type) {
  const existing = document.querySelector(".message");
  if (existing) existing.remove();
  
  const msg = document.createElement("div");
  msg.className = `message ${type}`;
  msg.textContent = message;
  
  const main = document.getElementById("main-content");
  main.insertBefore(msg, main.firstChild);
  
  setTimeout(() => msg.remove(), 5000);
}

// Initialize
checkAuth();

