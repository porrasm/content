import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import { env } from "./env";
import crypto from "crypto";

const toBase64Url = (input: Buffer | string): string => {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
};

const randomString = (bytes = 32): string => {
  return toBase64Url(crypto.randomBytes(bytes));
};

const sessionSecret = env.SESSION_SECRET || randomString(32);

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      picture?: string;
    }
  }
}

// Configure Google OAuth strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.OAUTH_CALLBACK_URL,
    },
    (accessToken, refreshToken, profile, done) => {
      const user: User = {
        id: profile.id,
        email: profile.emails?.[0]?.value || "",
        name: profile.displayName || "",
        picture: profile.photos?.[0]?.value,
      };
      return done(null, user);
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user: Express.User, done) => {
  done(null, user);
});

export function setupAuth(app: express.Application) {
  // Trust proxy for proper session handling behind reverse proxy (Dokku)
  app.set("trust proxy", 1);

  app.use(
    session({
      secret: sessionSecret,
      resave: true, // Save session even if not modified (needed for OAuth)
      saveUninitialized: true, // Save uninitialized sessions (needed for OAuth state)
      cookie: {
        secure: true, // Always use secure cookies in production (HTTPS)
        httpOnly: true,
        sameSite: "lax", // Helps with OAuth redirects
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
      name: "session", // Explicit session name
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // OAuth routes
  app.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
  );

  app.get(
    "/auth/google/callback",
    (req, res, next) => {
      // Log callback for debugging
      if (req.query.error) {
        console.error("OAuth error:", req.query.error, req.query.error_description);
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Authentication Error</title>
            <link rel="stylesheet" href="/style.css">
          </head>
          <body>
            <div class="container">
              <h1>Authentication Error</h1>
              <p>${req.query.error_description || req.query.error}</p>
              <a href="/auth/google" class="btn">Try Again</a>
            </div>
          </body>
          </html>
        `);
      }
      next();
    },
    passport.authenticate("google", { 
      failureRedirect: "/?error=auth_failed",
      failureMessage: true 
    }),
    (req, res) => {
      // Log authentication success for debugging
      if (req.user) {
        console.log("User authenticated:", req.user.email);
      }
      
      // Save session explicitly after authentication
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.redirect("/?error=session_failed");
        }
        console.log("Session saved successfully");
        res.redirect("/");
      });
    }
  );

  app.get("/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.redirect("/");
    });
  });
}

export function isAuthorized(email: string): boolean {
  const authorizedEmails = env.AUTHORIZED_EMAILS.split(",").map((e) =>
    e.trim().toLowerCase()
  );
  return authorizedEmails.includes(email.toLowerCase());
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isAuthorized(req.user.email)) {
    return res.status(403).json({ error: "Forbidden: Email not authorized" });
  }

  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  // Just pass through, authentication is optional
  next();
}
