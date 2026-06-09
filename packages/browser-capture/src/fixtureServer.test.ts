import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { startFixtureServer } from "./fixtureServer.js";

const tempDir = await mkdtemp(join(tmpdir(), "browser-capture-fixture-"));
const htmlPath = join(tempDir, "fixture.html");
await writeFile(htmlPath, "<html><body><h1>Original fixture</h1></body></html>", "utf8");

const server = await startFixtureServer(pathToFileURL(htmlPath));

try {
  assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);

  const rootResponse = await fetch(server.url);
  assert.equal(rootResponse.status, 200);
  assert.equal(await rootResponse.text(), "<html><body><h1>Original fixture</h1></body></html>");

  await writeFile(htmlPath, "<html><body><h1>Changed fixture</h1></body></html>", "utf8");

  const indexResponse = await fetch(new URL("/index.html", server.url));
  assert.equal(indexResponse.status, 200);
  assert.equal(await indexResponse.text(), "<html><body><h1>Original fixture</h1></body></html>");

  const missingResponse = await fetch(new URL("/missing", server.url));
  assert.equal(missingResponse.status, 404);
} finally {
  await server.close();
  await rm(tempDir, { recursive: true, force: true });
}

console.log("fixtureServer tests passed");
