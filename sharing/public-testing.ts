import { Database } from "bun:sqlite";
import { readdir } from "node:fs/promises";
import { utf8, type D1Database, type D1Statement } from "./protocol";

class Statement implements D1Statement {
  constructor(
    readonly owner: TestDatabase,
    readonly sql: string,
    readonly values: (string | number | null)[] = [],
  ) {}
  bind(...values: (string | number | null)[]) {
    return new Statement(this.owner, this.sql, values);
  }
  native() {
    let position = 0;
    const sql = this.sql.replace(/\?/g, () =>
      typeof this.values[position++] === "string" ? "CAST(? AS TEXT)" : "?",
    );
    return {
      query: this.owner.sqlite.query(sql),
      values: this.values.map((value) => (typeof value === "string" ? utf8(value) : value)),
    };
  }
  async first<T>() {
    const { query, values } = this.native();
    return query.get(...values) as T | null;
  }
  async all<T>() {
    const { query, values } = this.native();
    return { success: true, results: query.all(...values) as T[] };
  }
}
/** Actual SQLite and atomic batches; cryptography remains the real WebAuthn verifier. */
export class TestDatabase implements D1Database {
  readonly sqlite = new Database(":memory:");
  beforeBatch: (() => void | Promise<void>) | null = null;
  prepare(sql: string) {
    return new Statement(this, sql);
  }
  async batch(statements: D1Statement[]) {
    await this.beforeBatch?.();
    return this.sqlite.transaction(() =>
      statements.map((statement) => {
        const { query, values } = (statement as Statement).native();
        query.run(...values);
        return { success: true };
      }),
    )();
  }
  async migrate() {
    this.sqlite.exec("PRAGMA foreign_keys=ON");
    const directory = new URL("./migrations/", import.meta.url);
    for (const name of (await readdir(directory)).filter((entry) => entry.endsWith(".sql")).sort())
      this.sqlite.exec(await Bun.file(new URL(name, directory)).text());
    this.sqlite.exec("UPDATE public_settings SET enabled=1 WHERE id=1");
  }
}
