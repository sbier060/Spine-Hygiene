/**
 * React context wiring for app state. Keeps the reducer out of components and
 * gives the pose loop a stable dispatch to push readings into.
 */
import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import {
  appReducer,
  initialAppState,
  type AppAction,
  type AppState,
} from "./appState";

interface AppContextValue {
  readonly state: AppState;
  readonly dispatch: Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return ctx;
}
