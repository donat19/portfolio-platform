// server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const port = 3000;

// ВАЖНО: server.js лежит в node_part, а фронт — на уровень выше: ../frontend
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function mimeTypeByExt(ext) {
  switch (ext) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".svg": return "image/svg+xml";
    case ".ico": return "image/x-icon";
    default: return "application/octet-stream";
  }
}

// Защита от выхода из FRONTEND_DIR через ../ (path traversal) [web:31][web:35]
function safeJoin(baseDir, requestPath) {
  const normalized = path.normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, "");
  return path.join(baseDir, normalized);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); }
      catch { reject(new Error("Invalid JSON")); }
    });
  });
}

function serveFile(req, res, filePath) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      return sendJson(res, 404, { error: "Not found" });
    }

    const ext = path.extname(filePath).toLowerCase();

    // --- WebP negotiation ---
    // Если запросили png/jpg/jpeg, но есть "тот же файл + .webp" рядом,
    // и клиент принимает image/webp, отдаем webp и ставим Vary: Accept [web:10][web:39].
    let finalPath = filePath;
    let finalExt = ext;

    const isRaster = (ext === ".png" || ext === ".jpg" || ext === ".jpeg");
    const accept = String(req.headers["accept"] || "");
    const acceptWebp = accept.includes("image/webp");

    if (isRaster && acceptWebp) {
      const candidate = filePath + ".webp"; // example.png.webp
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          finalPath = candidate;
          finalExt = ".webp";
          res.setHeader("Vary", "Accept");
        }
      } catch {
        // если есть проблема с fs, просто отдаем оригинал
      }
    }

    res.writeHead(200, {
      "Content-Type": mimeTypeByExt(finalExt),
      // для разработки можно no-store; для продакшена лучше кэшировать ассеты с хешами
      "Cache-Control": "no-store",
    });

    fs.createReadStream(finalPath)
      .on("error", () => sendJson(res, 500, { error: "Read error" }))
      .pipe(res);
  });
}

http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const u = new URL(req.url, `http://${req.headers.host}`);
  const pathname = u.pathname;

  // API
  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, ts: Date.now() });
  }

  if (req.method === "POST" && pathname === "/api/contact") {
    try {
      const payload = await readJson(req);
      console.log("CONTACT:", payload);
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // Static frontend
  if (req.method === "GET") {
    const rel = pathname === "/" ? "/index.html" : pathname;
    const filePath = safeJoin(FRONTEND_DIR, rel);
    return serveFile(req, res, filePath);
  }

  return sendJson(res, 405, { error: "Method not allowed" });
}).listen(port, () => {
  console.log(`Server: http://localhost:${port}/`);
  console.log(`Frontend dir: ${FRONTEND_DIR}`);
});
