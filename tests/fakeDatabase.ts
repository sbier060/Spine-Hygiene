import type { ExecuteResult, SpineDatabase } from "../src/storage/database";

/** In-memory recorder standing in for the Tauri SQLite database in tests. */
export class FakeDatabase implements SpineDatabase {
  readonly executed: { sql: string; params: readonly unknown[] }[] = [];
  /** Rows returned by the next select() call(s). */
  selectRows: unknown[] = [];
  private nextId = 1;

  execute(sql: string, params: readonly unknown[] = []): Promise<ExecuteResult> {
    this.executed.push({ sql, params });
    return Promise.resolve({ rowsAffected: 1, lastInsertId: this.nextId++ });
  }

  select<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    this.executed.push({ sql, params });
    return Promise.resolve(this.selectRows as T[]);
  }

  /** Convenience: last executed statement. */
  get last(): { sql: string; params: readonly unknown[] } | undefined {
    return this.executed[this.executed.length - 1];
  }
}
