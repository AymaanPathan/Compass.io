import axios from "axios";
import type { DeveloperProfile } from "./../types";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const http = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function githubLoginUrl() {
  return `${API_URL}/api/auth/github`;
}

export async function fetchMe() {
  const { data } = await http.get("/api/auth/me");
  return data.user;
}

export async function logout() {
  await http.post("/api/auth/logout");
}

// ---------------------------------------------------------------------------
// Developer profile agent
// ---------------------------------------------------------------------------

export async function fetchDeveloperProfile(force = false): Promise<{
  profile: DeveloperProfile | null;
  raw: string | null;
  parseFailed: boolean;
  cached: boolean;
  generatedAt?: string;
}> {
  const { data } = await http.get("/api/github/profile", {
    params: force ? { refresh: "true" } : undefined,
  });
  console.log("Fetched developer profile:", data);
  return data;
}
