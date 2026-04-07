/**
 * Static file server for local testing (no Python required).
 * Usage: node serve.mjs
 * Then open http://localhost:8080
 */
import http from "http";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent(reqPath.split("?")[0]);
  const rel = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = path.join(root, rel);
  if (!full.startsWith(root)) return null;
  return full;
}

const server = http.createServer(async (req, res) => {
  try {
    let filePath = safeJoin(__dirname, req.url === "/" ? "/index.html" : req.url);
    if (!filePath) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.writeHead(200);
    res.end(data);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e && e.message));
  }
});

server.listen(PORT, () => {
  console.log("Rift Hunters — open http://localhost:" + PORT);
});
