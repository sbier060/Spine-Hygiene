/**
 * Dashboard integration smoke test: renders the real provider tree in jsdom
 * (in-memory history, no camera), and exercises the name prompt and voice
 * toggles against the real localStorage-backed settings.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppProvider } from "../src/app/AppProvider";
import { HistoryProvider } from "../src/app/HistoryProvider";
import { DashboardScreen } from "../src/screens/DashboardScreen";

const SETTINGS_KEY = "spine-iq.settings.v3";

function renderDashboard(): ReturnType<typeof render> {
  return render(
    <AppProvider>
      <HistoryProvider>
        <DashboardScreen />
      </HistoryProvider>
    </AppProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("DashboardScreen", () => {
  it("renders the hub: ring, trend section, stats, status chip", () => {
    renderDashboard();
    expect(screen.getAllByText(/good posture/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/last 14 days/i)).toBeInTheDocument();
    expect(screen.getByText(/not monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/longest sit/i)).toBeInTheDocument();
  });

  it("saves the user's name from the prompt card", () => {
    renderDashboard();
    const input = screen.getByPlaceholderText(/your first name/i);
    fireEvent.change(input, { target: { value: "Alek" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as {
      userName?: string;
    };
    expect(stored.userName).toBe("Alek");
    // The prompt disappears once a name exists.
    expect(screen.queryByPlaceholderText(/your first name/i)).toBeNull();
  });

  it("persists the voice toggles", () => {
    renderDashboard();
    fireEvent.click(screen.getByText(/voice, data & privacy/i));
    fireEvent.click(screen.getByLabelText(/spoken slouch alerts/i));
    let stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as {
      voiceEnabled?: boolean;
      morningGreetingEnabled?: boolean;
    };
    expect(stored.voiceEnabled).toBe(false);

    fireEvent.click(screen.getByLabelText(/daily greeting/i));
    stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as {
      voiceEnabled?: boolean;
      morningGreetingEnabled?: boolean;
    };
    expect(stored.morningGreetingEnabled).toBe(false);
  });
});
