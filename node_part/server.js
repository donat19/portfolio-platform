// server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const port = 3000;

// server.js лежит в node_part, фронт — ../frontend
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

// защита от ../
function safeJoin(baseDir, requestPath) {
  const normalized = path.normalize(requestPath).replace(/^(..(\/|\\|$))+/, "");
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

    // WebP negotiation (как у тебя было)
    let finalPath = filePath;
    let finalExt = ext;
    const isRaster = (ext === ".png" || ext === ".jpg" || ext === ".jpeg");
    const accept = String(req.headers["accept"] || "");
    const acceptWebp = accept.includes("image/webp");

    if (isRaster && acceptWebp) {
      const candidate = filePath + ".webp";
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          finalPath = candidate;
          finalExt = ".webp";
          res.setHeader("Vary", "Accept");
        }
      } catch {}
    }

    res.writeHead(200, {
      "Content-Type": mimeTypeByExt(finalExt),
      "Cache-Control": "no-store",
    });

    fs.createReadStream(finalPath)
      .on("error", () => sendJson(res, 500, { error: "Read error" }))
      .pipe(res);
  });
}

function serveFrontendPath(req, res, pathname) {
  // 1) Главная
  if (pathname === "/") {
    return serveFile(req, res, safeJoin(FRONTEND_DIR, "/index.html"));
  }

  // 2) /projects/project-one.html -> /project-one.html (файлы лежат в корне frontend)
  if (pathname.startsWith("/projects/")) {
    const base = path.basename(pathname); // project-one.html
    const mapped = "/" + base;            // /project-one.html
    return serveFile(req, res, safeJoin(FRONTEND_DIR, mapped));
  }

  // 3) Все остальные файлы как есть: /styles.css, /main.js, /python.jpg ...
  return serveFile(req, res, safeJoin(FRONTEND_DIR, pathname));
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

  // Frontend
  if (req.method === "GET") {
    return serveFrontendPath(req, res, pathname);
  }

  return sendJson(res, 405, { error: "Method not allowed" });
}).listen(port, () => {
  console.log(`Server: http://localhost:${port}/`);
  console.log(`Frontend dir: ${FRONTEND_DIR}`);
});
