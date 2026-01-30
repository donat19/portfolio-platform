// wal.js
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

export class WAL {
  constructor(filePath, { fsyncEachWrite = true } = {}) {
    this.filePath = filePath;
    this.fsyncEachWrite = fsyncEachWrite;
    this.handle = null;
  }

  async open() {
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    this.handle = await fsp.open(this.filePath, "a+"); // append + read
  }

  async close() {
    if (this.handle) await this.handle.close();
    this.handle = null;
  }

  async append(entry) {
    if (!this.handle) throw new Error("WAL not open");
    const line = JSON.stringify(entry) + "\n";
    await this.handle.write(line, null, "utf8");
    if (this.fsyncEachWrite) await this.handle.sync(); // fsync
  }

  async *replay() {
    // Читаем построчно (jsonl). Если файла нет — просто ничего.
    try {
      await fsp.access(this.filePath);
    } catch {
      return;
    }

    const stream = fs.createReadStream(this.filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      const s = line.trim();
      if (!s) continue;
      yield JSON.parse(s);
    }
  }

  async reset() {
    await this.close();
    await fsp.writeFile(this.filePath, "", "utf8");
    await this.open();
  }
}
