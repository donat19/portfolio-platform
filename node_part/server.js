// node_part/server.js (CommonJS)
// Один сервер на :3000: статика + /api/* + ThreadForge на /db/* + auth (users/sessions) через cookies

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("node:crypto");
const { URL } = require("url");

const port = 3000;
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

/* ----------------- CORS ----------------- */
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/* ----------------- JSON ----------------- */
function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/* ----------------- Cookies ----------------- */
function parseCookies(req) {
  const h = req.headers.cookie || "";
  const out = {};
  h.split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) return;
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function pushSetCookie(res, cookie) {
  const prev = res.getHeader("Set-Cookie");
  if (!prev) res.setHeader("Set-Cookie", [cookie]);
  else if (Array.isArray(prev)) res.setHeader("Set-Cookie", prev.concat(cookie));
  else res.setHeader("Set-Cookie", [prev, cookie]);
}

function setCookie(res, name, value, opts = {}) {
  const {
    httpOnly = true,
    sameSite = "Lax",
    cookiePath = "/",
    maxAge, // seconds
    secure = false,
  } = opts;

  let c = `${name}=${encodeURIComponent(value)}; Path=${cookiePath}; SameSite=${sameSite}`;
  if (httpOnly) c += "; HttpOnly";
  if (secure) c += "; Secure";
  if (typeof maxAge === "number") c += `; Max-Age=${maxAge}`;
  pushSetCookie(res, c);
}

function clearCookie(res, name) {
  setCookie(res, name, "", { maxAge: 0 });
}

/* ----------------- Password hashing ----------------- */
function scryptHash(password, saltBuf) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, saltBuf, 64, (err, key) => {
      if (err) return reject(err);
      resolve(key); // Buffer
    });
  });
}

function safeEq(aBuf, bBuf) {
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/* ----------------- Static files ----------------- */
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

function safeJoin(baseDir, requestPath) {
  const normalized = path.normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, "");
  return path.join(baseDir, normalized);
}

function serveFile(req, res, filePath) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      return sendJson(res, 404, { error: "Not found" });
    }

    const ext = path.extname(filePath).toLowerCase();

    // WebP negotiation
    let finalPath = filePath;
    let finalExt = ext;
    const isRaster = ext === ".png" || ext === ".jpg" || ext === ".jpeg";
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
  // /
  if (pathname === "/") {
    return serveFile(req, res, safeJoin(FRONTEND_DIR, "/index.html"));
  }

  // /projects/project-one.html -> /project-one.html (файлы лежат в корне frontend)
  if (pathname.startsWith("/projects/")) {
    const base = path.basename(pathname);
    const mapped = "/" + base;
    return serveFile(req, res, safeJoin(FRONTEND_DIR, mapped));
  }

  // все остальное: /styles.css, /main.js, /project-one.css ...
  return serveFile(req, res, safeJoin(FRONTEND_DIR, pathname));
}

/* ----------------- Main ----------------- */
async function main() {
  // Подключаем ThreadForge (ESM) как библиотеку
  const { createThreadForge } = await import("./ThreadForge/server.js");
  const tf = await createThreadForge({
    dir: path.join(__dirname, "ThreadForge", "data"),
    fsyncEachWrite: true,
    mountPath: "/db",
  });

  // Auth storage (в ThreadForge)
  const USERS_COL = "auth_users";
  const SESS_COL = "auth_sessions";
  const SID_COOKIE = "sid";
  const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 дней

  async function authRegister(payload) {
    const username = String(payload?.username || "").trim().toLowerCase();
    const password = String(payload?.password || "");

    if (username.length < 3) return { ok: false, code: 400, error: "Username too short" };
    if (password.length < 6) return { ok: false, code: 400, error: "Password too short" };

    const existing = tf.db.get(USERS_COL, username);
    if (existing) return { ok: false, code: 409, error: "User already exists" };

    const salt = crypto.randomBytes(16);
    const hash = await scryptHash(password, salt);

    await tf.db.put(USERS_COL, {
      _id: username,
      salt: salt.toString("base64"),
      hash: hash.toString("base64"),
      createdAt: Date.now(),
    });

    return { ok: true };
  }

  async function authLogin(payload) {
    const username = String(payload?.username || "").trim().toLowerCase();
    const password = String(payload?.password || "");

    const u = tf.db.get(USERS_COL, username);
    if (!u) return { ok: false, code: 401, error: "Invalid credentials" };

    const salt = Buffer.from(u.salt, "base64");
    const expected = Buffer.from(u.hash, "base64");
    const got = await scryptHash(password, salt);

    if (!safeEq(expected, got)) return { ok: false, code: 401, error: "Invalid credentials" };

    const sid = crypto.randomBytes(24).toString("hex");
    const exp = Date.now() + SESSION_TTL_SEC * 1000;

    await tf.db.put(SESS_COL, { _id: sid, userId: username, exp });

    return { ok: true, sid, user: { id: username } };
  }

  function authMe(req) {
    const cookies = parseCookies(req);
    const sid = cookies[SID_COOKIE];
    if (!sid) return { ok: false, code: 401, error: "No session" };

    const s = tf.db.get(SESS_COL, sid);
    if (!s) return { ok: false, code: 401, error: "No session" };
    if (Date.now() > Number(s.exp || 0)) {
      try { tf.db.del(SESS_COL, sid); } catch {}
      return { ok: false, code: 401, error: "Session expired" };
    }

    return { ok: true, user: { id: s.userId } };
  }

  function authLogout(req) {
    const cookies = parseCookies(req);
    const sid = cookies[SID_COOKIE];
    if (sid) {
      try { tf.db.del(SESS_COL, sid); } catch {}
    }
    return { ok: true };
  }

  const server = http.createServer(async (req, res) => {
    setCors(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const u = new URL(req.url, `http://${req.headers.host}`);
    const pathname = u.pathname;

    // ThreadForge: /db/*
    if (pathname === "/db" || pathname.startsWith("/db/")) {
      return tf.handle(req, res);
    }

    // Auth API
    if (req.method === "POST" && pathname === "/api/auth/register") {
      try {
        const payload = await readJson(req);
        const r = await authRegister(payload);
        return sendJson(res, r.ok ? 200 : r.code, r.ok ? { ok: true } : { ok: false, error: r.error });
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: String(e?.message ?? e) });
      }
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
      try {
        const payload = await readJson(req);
        const r = await authLogin(payload);
        if (!r.ok) return sendJson(res, r.code, { ok: false, error: r.error });

        // На HTTPS/проде поставишь secure:true
        setCookie(res, SID_COOKIE, r.sid, {
          httpOnly: true,
          sameSite: "Lax",
          maxAge: SESSION_TTL_SEC,
          secure: false,
        });

        return sendJson(res, 200, { ok: true, user: r.user });
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: String(e?.message ?? e) });
      }
    }

    if (req.method === "GET" && pathname === "/api/auth/me") {
      const r = authMe(req);
      return sendJson(res, r.ok ? 200 : r.code, r.ok ? r : { ok: false, error: r.error });
    }

    if (req.method === "POST" && pathname === "/api/auth/logout") {
      const r = authLogout(req);
      clearCookie(res, SID_COOKIE);
      return sendJson(res, 200, r);
    }

    // misc API
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
  });

  server.listen(port, () => {
    console.log(`Server: http://localhost:${port}/`);
    console.log(`Frontend dir: ${FRONTEND_DIR}`);
    console.log("ThreadForge mounted at /db/*");
  });

  process.on("SIGINT", async () => {
    server.close();
    await tf.close();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
