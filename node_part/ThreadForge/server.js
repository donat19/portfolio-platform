// node_part/ThreadForge/server.js (ESM)
// ThreadForge как библиотека: createThreadForge() -> { handle(req,res), close(), db }

import { URL } from "node:url";
import { fileURLToPath } from "node:url";
import path from "node:path";

// db.js может экспортировать default или именованный JsonDb — поддержим оба варианта
import * as DbMod from "./db.js";

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

export async function createThreadForge({
  dir, // абсолютный путь до папки data
  fsyncEachWrite = true,
  mountPath = "/db", // где будет смонтирован в главном сервере
} = {}) {
  const JsonDb = DbMod.default ?? DbMod.JsonDb;
  if (!JsonDb) {
    throw new Error("ThreadForge/db.js must export default or named export JsonDb");
  }

  // по умолчанию: node_part/ThreadForge/data
  const defaultDir = fileURLToPath(new URL("./data", import.meta.url));
  const dataDir = dir ? path.resolve(dir) : defaultDir;

  const db = new JsonDb({ dir: dataDir, fsyncEachWrite });
  await db.start();

  async function handle(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);

      // Срезаем mountPath: /db/users/get -> /users/get
      let p = url.pathname;
      if (mountPath && (p === mountPath || p.startsWith(mountPath + "/"))) {
        p = p.slice(mountPath.length) || "/";
      }

      const parts = p.split("/").filter(Boolean);

      // POST /admin/snapshot
      if (req.method === "POST" && parts[0] === "admin" && parts[1] === "snapshot") {
        const r = await db.snapshot();
        return send(res, 200, r);
      }

      // routes:
      // POST /:col/put   body: { doc }
      // GET  /:col/get   ?id=...
      // POST /:col/del   body: { id }
      // POST /:col/find  body: {...}

      const [col, action] = parts;
      if (!col || !action) return send(res, 404, { error: "Not found" });

      if (req.method === "POST" && action === "put") {
        const body = await readJson(req);
        const r = await db.put(col, body.doc);
        return send(res, 200, r);
      }

      if (req.method === "GET" && action === "get") {
        const id = url.searchParams.get("id");
        if (!id) return send(res, 400, { error: "id required" });
        return send(res, 200, { ok: true, doc: db.get(col, id) });
      }

      if (req.method === "POST" && action === "del") {
        const body = await readJson(req);
        if (!body.id) return send(res, 400, { error: "id required" });
        const r = await db.del(col, body.id);
        return send(res, 200, r);
      }

      if (req.method === "POST" && action === "find") {
        const body = await readJson(req);
        const docs = db.find(col, body);
        return send(res, 200, { ok: true, docs });
      }

      return send(res, 404, { error: "Not found" });
    } catch (e) {
      return send(res, 500, { error: String(e?.message ?? e) });
    }
  }

  async function close() {
    await db.stop();
  }

  // ВАЖНО: db отдаём наружу, чтобы общий сервер мог делать auth без HTTP "сам-в-себя"
  return { handle, close, db };
}
