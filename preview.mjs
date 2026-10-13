import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = resolve(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);
const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function handler(request, response) {
  try {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname === "/api/finance") {
      const snapshot = JSON.parse(await readFile(resolve(ROOT, "private-data.json"), "utf8"));
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({ rows: snapshot.rows || [], updatedAt: snapshot.updatedAt || "", source: "local-snapshot" }));
      return;
    }

    const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = resolve(PUBLIC, `.${requested}`);
    if (file !== PUBLIC && !file.startsWith(PUBLIC + sep)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Não encontrado");
  }
}

createServer(handler).listen(PORT, "127.0.0.1", () => {
  console.log(`Prévia local disponível em http://127.0.0.1:${PORT}`);
});
