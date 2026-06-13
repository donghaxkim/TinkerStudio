import { resolve } from "node:path";

export type ApiConfig = {
  port: number;
  host: "127.0.0.1";
  corsOrigins: string[];
  repoRoot: string;
};

const DEFAULT_CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

function parsePort(value: string | undefined) {
  if (value === undefined || value.trim() === "") {
    return 4500;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("TINKER_API_PORT must be an integer between 1 and 65535");
  }

  return port;
}

function parseCorsOrigins(value: string | undefined) {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_CORS_ORIGINS;
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    port: parsePort(env.TINKER_API_PORT),
    host: "127.0.0.1",
    corsOrigins: parseCorsOrigins(env.TINKER_API_CORS_ORIGINS),
    repoRoot: resolve(env.TINKER_REPO_ROOT ?? process.cwd(), env.TINKER_REPO_ROOT === undefined ? "../.." : "."),
  };
}
