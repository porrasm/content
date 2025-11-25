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
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
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
    passport.authenticate("google", { failureRedirect: "/login" }),
    (req, res) => {
      res.redirect("/");
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
