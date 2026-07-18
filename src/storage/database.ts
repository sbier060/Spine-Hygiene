/**
 * Database abstraction. Repositories depend on the small `SpineDatabase`
 * interface, not on Tauri directly, so their logic is testable with an in-memory
 * fake. The real implementation is backed by the Tauri SQL plugin and only runs
 * in the native app.
 */
import { SCHEMA_STATEMENTS, MIGRATION_STATEMENTS } from "./schema";

export interface ExecuteResult {
  readonly rowsAffected: number;
  readonly lastInsertId?: number | undefined;
}

export interface SpineDatabase {
  execute(sql: string, params?: readonly unknown[]): Promise<ExecuteResult>;
  select<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
}

/** True when running inside the Tauri WebView (SQLite available). */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Load the SQLite database via the Tauri SQL plugin and run migrations.
 * Only call inside the app; throws/awaits Tauri APIs otherwise.
 */
export async function createTauriDatabase(
  url = "sqlite:spine-iq.db",
): Promise<SpineDatabase> {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  const db = await Database.load(url);
  const wrapper: SpineDatabase = {
    async execute(sql, params = []) {
      const result = await db.execute(sql, params as unknown[]);
      return {
        rowsAffected: result.rowsAffected,
        lastInsertId: result.lastInsertId,
      };
    },
    select<T>(sql: string, params: readonly unknown[] = []) {
      return db.select<T>(sql, params as unknown[]);
    },
  };
  await runMigrations(wrapper);
  return wrapper;
}

/** Run the idempotent schema DDL, then the tolerated migration statements. */
export async function runMigrations(db: SpineDatabase): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await db.execute(statement);
  }
  for (const statement of MIGRATION_STATEMENTS) {
    try {
      await db.execute(statement);
    } catch {
      // Expected on re-runs (e.g. "duplicate column name" from ALTER TABLE).
    }
  }
}
