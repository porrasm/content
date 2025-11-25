import dotenv from "dotenv";
import path from "path";

// Load .env file from backend directory
// When running with tsx from backend/, process.cwd() is the backend directory
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import z from "zod";

const envSchema = z.object({
  PORT: z.string().transform((val: string) => parseInt(val, 10)).pipe(z.number().int().positive()),
  DATA_DIRECTORY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  OAUTH_CALLBACK_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(1).optional(),
  AUTHORIZED_EMAILS: z.string().min(1), // comma-separated list of email addresses
});

export const env = envSchema.parse(process.env);
