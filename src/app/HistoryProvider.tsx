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
import { useAppContext } from "./AppProvider";

const HistoryContext = createContext<HistoryStore | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }): JSX.Element {
  const { dispatch } = useAppContext();
  const storeRef = useRef<HistoryStore | null>(null);
  storeRef.current ??= new HistoryStore(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    const store = storeRef.current;
    void createTauriDatabase()
      .then(async (db) => {
        if (cancelled || !store) return;
        store.attachDatabase(db);
        // Restore saved calibration so the user doesn't recalibrate every launch.
        const { sitting, standing } = await store.loadCalibrations();
        if (cancelled) return;
        if (sitting?.postureBaseline) {
          dispatch({ type: "set_baseline", baseline: sitting.postureBaseline });
        }
        if (sitting?.positionBaseline) {
          dispatch({ type: "set_position_baseline", baseline: sitting.positionBaseline });
        }
        if (standing?.positionBaseline) {
          dispatch({ type: "set_position_baseline", baseline: standing.positionBaseline });
        }
        // With a saved posture baseline we can skip straight to the sandbox.
        if (sitting?.postureBaseline) {
          dispatch({ type: "set_phase", phase: "sandbox" });
        }
      })
      .catch((err: unknown) => {
        // Non-fatal: history just stays in-memory this session.
        console.error("Spine-IQ: failed to open history database", err);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

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
