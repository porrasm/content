# Content Host

A minimal service for hosting images and markdown documents with expiration dates and access control.

## Features

- **Image Upload**: Authorized users can upload images with optional expiration dates
- **Markdown Documents**: Create and share markdown documents with optional expiration dates
- **Access Control**: Documents can be marked as private (authorized users only) or public (accessible via secret link)
- **OAuth Authentication**: Google OAuth for user authentication
- **Dark Theme**: Minimal, modern dark theme UI

## Setup

### Prerequisites

- Node.js 18+
- Google OAuth credentials
- Dokku (for deployment)

### Local Development

1. Install dependencies:
```bash
cd backend
npm install
```

2. Create a `.env` file in the `backend` directory:
```env
PORT=3000
DATA_DIRECTORY=./data
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
OAUTH_CALLBACK_URL=http://localhost:3000/auth/google/callback
SESSION_SECRET=your-session-secret-here
AUTHORIZED_EMAILS=user@example.com,admin@example.com
```

3. Build the project:
```bash
npm run build
```

4. Start the server:
```bash
npm start
```

For development with hot reload:
```bash
npm run dev
```

5. Run cleanup job (to remove expired content):
```bash
npm run cleanup
```

## Deployment to Dokku

1. Create a Dokku app:
```bash
dokku apps:create content-host
```

2. Set up persistent storage for data (mount a directory from your VPS):

   **Option A: Using Dokku's storage plugin (recommended)**
   ```bash
   # Create the storage directory
   dokku storage:ensure-directory content-host-data
   
   # Mount it to /app/data in the container
   dokku storage:mount content-host /app/data:/var/lib/dokku/data/storage/content-host-data
   ```

   **Option B: Using a custom path on your VPS**
   ```bash
   # Create a directory on your VPS (e.g., /var/lib/content-host)
   sudo mkdir -p /var/lib/content-host
   sudo chown dokku:dokku /var/lib/content-host
   
   # Mount it to /app/data in the container
   dokku storage:mount content-host /app/data:/var/lib/content-host
   ```

3. Set environment variables:
```bash
dokku config:set content-host \
  PORT=3000 \
  DATA_DIRECTORY=/app/data \
  GOOGLE_CLIENT_ID=your-google-client-id \
  GOOGLE_CLIENT_SECRET=your-google-client-secret \
  OAUTH_CALLBACK_URL=https://content.porras.club/auth/google/callback \
  SESSION_SECRET=your-session-secret-here \
  AUTHORIZED_EMAILS=user@example.com,admin@example.com
```

   **Note:** The `DATA_DIRECTORY` must match the mount point inside the container (`/app/data` in the examples above).

4. Verify the storage mount:
```bash
# Check mounted directories
dokku storage:report content-host
```

5. Set domain:
```bash
dokku domains:set content-host content.porras.club
```

   **Note:** The "No web listeners" warning is normal before deployment. It will be created when you deploy the app.

   **Important:** If you have multiple Dokku apps, make sure each app has its own domain configured. You can check domains with:
   ```bash
   dokku domains:report content-host
   dokku domains:report eink  # or whatever your other app is named
   ```

6. Deploy:
```bash
git remote add dokku dokku@your-server:content-host
git push dokku main
```

7. Enable HTTPS with Let's Encrypt (after deployment):
```bash
# Install the Let's Encrypt plugin if not already installed
sudo dokku plugin:install https://github.com/dokku/dokku-letsencrypt.git

# Verify the domain is set correctly
dokku domains:report content-host

# Enable Let's Encrypt for your app
dokku letsencrypt:enable content-host

# Set up auto-renewal (optional but recommended)
dokku letsencrypt:set content-host email your-email@example.com
```

   **Important:** 
   - Make sure your domain DNS is pointing to your VPS before enabling Let's Encrypt, otherwise the certificate request will fail.
   - If you have multiple apps, ensure each app has its own SSL certificate. Dokku will automatically route HTTPS traffic to the correct app based on the domain.
   - If HTTPS is serving the wrong app, check that the domain is correctly set:
     ```bash
     # Check which domains are configured for each app
     dokku domains:report content-host
     dokku domains:report eink  # or your other app name
     
     # If content.porras.club is assigned to the wrong app, remove it first:
     dokku domains:clear eink  # or the app that incorrectly has the domain
     dokku domains:set content-host content.porras.club
     ```

8. Set up cleanup cron job (optional):
```bash
dokku cron:add content-host "0 2 * * * cd /app && node dist/cleanup.js"
```

## Project Structure

```
backend/
  src/
    index.ts          # Main server file
    env.ts            # Environment configuration
    db.ts             # Database setup and models
    auth.ts           # Authentication middleware
    routes/
      images.ts       # Image upload and management routes
      documents.ts    # Document creation and management routes
    cleanup.ts        # Cleanup job for expired content
  public/
    index.html        # Frontend HTML
    style.css         # Main styles (dark theme)
    markdown.css      # Markdown rendering styles
    app.js            # Frontend JavaScript
```

## API Endpoints

### Authentication
- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/google/callback` - OAuth callback
- `GET /auth/logout` - Logout
- `GET /api/user` - Get current user info

### Images
- `POST /api/images/upload` - Upload image (requires auth)
- `GET /api/images` - List user's images (requires auth)
- `GET /api/images/:id` - Serve image
- `DELETE /api/images/:id` - Delete image (requires auth)

### Documents
- `POST /api/documents` - Create document (requires auth)
- `GET /api/documents` - List user's documents (requires auth)
- `GET /api/documents/:secretLink` - Get document by secret link
- `PUT /api/documents/:id` - Update document (requires auth)
- `DELETE /api/documents/:id` - Delete document (requires auth)

### Public
- `GET /documents/:secretLink` - View document (rendered markdown)

## License

ISC

