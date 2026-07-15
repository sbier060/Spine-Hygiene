/**
 * Provides a single HistoryStore to the app. The store works in-memory
 * everywhere; when running in the native app it asynchronously attaches the
 * SQLite database so history persists across launches.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { HistoryStore } from "../storage/historyStore";
import { createTauriDatabase, isTauriRuntime } from "../storage/database";

const HistoryContext = createContext<HistoryStore | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }): JSX.Element {
  const storeRef = useRef<HistoryStore | null>(null);
  storeRef.current ??= new HistoryStore(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    void createTauriDatabase()
      .then((db) => {
        if (!cancelled) storeRef.current?.attachDatabase(db);
      })
      .catch((err: unknown) => {
        // Non-fatal: history just stays in-memory this session.
        console.error("Spine-IQ: failed to open history database", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <HistoryContext.Provider value={storeRef.current}>
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory(): HistoryStore {
  const ctx = useContext(HistoryContext);
  if (!ctx) {
    throw new Error("useHistory must be used within a HistoryProvider");
  }
  return ctx;
}
