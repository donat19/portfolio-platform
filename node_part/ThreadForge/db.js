// db.js
import fsp from "node:fs/promises";
import path from "node:path";
import { WAL } from "./wal.js";

function nowMs() {
  return Date.now();
}

function ensureId(doc) {
  const id = doc?._id ?? doc?.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Document must have string _id (or id)");
  }
  return id;
}

function matchFilter(doc, filter) {
  if (!filter || typeof filter !== "object") return true;

  for (const [k, v] of Object.entries(filter)) {
    const dv = doc?.[k];

    if (v && typeof v === "object" && !Array.isArray(v)) {
      if ("$gt" in v && !(dv > v.$gt)) return false;
      if ("$gte" in v && !(dv >= v.$gte)) return false;
      if ("$lt" in v && !(dv < v.$lt)) return false;
      if ("$lte" in v && !(dv <= v.$lte)) return false;
      if ("$eq" in v && !(dv === v.$eq)) return false;
      continue;
    }

    if (dv !== v) return false;
  }

  return true;
}

export class JsonDb {
  constructor({ dir = "./data", fsyncEachWrite = true } = {}) {
    this.dir = dir;
    this.snapshotPath = path.join(dir, "snapshot.json");
    this.walPath = path.join(dir, "wal.jsonl");
    this.wal = new WAL(this.walPath, { fsyncEachWrite });

    this.collections = new Map(); // name -> Map(id -> doc)
    this.seq = 0; // monotonically increasing
    this._writer = Promise.resolve(); // serialize writes
  }

  _col(name) {
    if (!this.collections.has(name)) this.collections.set(name, new Map());
    return this.collections.get(name);
  }

  async start() {
    await fsp.mkdir(this.dir, { recursive: true });

    // 1) snapshot
    await this._loadSnapshotIfExists();

    // 2) WAL replay
    await this.wal.open();
    for await (const e of this.wal.replay()) {
      this._applyEntry(e);
      if (typeof e.seq === "number") this.seq = Math.max(this.seq, e.seq);
    }
  }

  async stop() {
    await this.wal.close();
  }

  async _loadSnapshotIfExists() {
    try {
      const raw = await fsp.readFile(this.snapshotPath, "utf8");
      const data = JSON.parse(raw);
      this.collections = new Map();

      for (const [colName, docs] of Object.entries(data.collections ?? {})) {
        const m = new Map();
        for (const doc of docs) {
          const id = ensureId(doc);
          m.set(id, doc);
        }
        this.collections.set(colName, m);
      }

      this.seq = data.seq ?? 0;
    } catch {
      // no snapshot
    }
  }

  _applyEntry(e) {
    if (!e || typeof e !== "object") return;
    const col = this._col(e.collection);

    if (e.op === "put") {
      col.set(e.id, e.doc);
      return;
    }
    if (e.op === "del") {
      col.delete(e.id);
      return;
    }
  }

  _enqueueWrite(fn) {
    this._writer = this._writer.then(fn, fn);
    return this._writer;
  }

  // -------- Public API --------

  get(collection, id) {
    const col = this._col(collection);
    return col.get(id) ?? null;
  }

  find(collection, { filter = {}, limit = 100, skip = 0 } = {}) {
    const col = this._col(collection);
    const out = [];
    let i = 0;

    for (const doc of col.values()) {
      if (!matchFilter(doc, filter)) continue;
      if (i++ < skip) continue;
      out.push(doc);
      if (out.length >= limit) break;
    }
    return out;
  }

  put(collection, doc) {
    return this._enqueueWrite(async () => {
      const id = ensureId(doc);
      const entry = {
        seq: ++this.seq,
        ts: nowMs(),
        op: "put",
        collection,
        id,
        doc: { ...doc, _id: id }
      };

      await this.wal.append(entry);
      this._applyEntry(entry);
      return { ok: true, id, seq: entry.seq };
    });
  }

  del(collection, id) {
    return this._enqueueWrite(async () => {
      const entry = {
        seq: ++this.seq,
        ts: nowMs(),
        op: "del",
        collection,
        id
      };

      await this.wal.append(entry);
      this._applyEntry(entry);
      return { ok: true, id, seq: entry.seq };
    });
  }

  snapshot() {
    return this._enqueueWrite(async () => {
      const tmp = this.snapshotPath + ".tmp";
      const obj = { seq: this.seq, collections: {} };

      for (const [colName, col] of this.collections.entries()) {
        obj.collections[colName] = Array.from(col.values());
      }

      await fsp.writeFile(tmp, JSON.stringify(obj), "utf8");
      await fsp.rename(tmp, this.snapshotPath);

      // После snapshot можно обнулить WAL (простая “компакция”)
      await this.wal.reset();

      return { ok: true, seq: this.seq };
    });
  }
}
