import { randomBytes } from "node:crypto";

/** 128bit URL-safe capability 토큰. */
export function newToken(): string {
  return randomBytes(16).toString("base64url");
}
