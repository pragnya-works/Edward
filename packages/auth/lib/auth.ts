import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db.js";

function getEnvVariable(name: string): string | undefined {
  return process.env[name];
}

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
    }),
    socialProviders: {
        github: {
          clientId: getEnvVariable("GITHUB_CLIENT_ID") || "",
          clientSecret: getEnvVariable("GITHUB_CLIENT_SECRET") || "",
        },
      },
});