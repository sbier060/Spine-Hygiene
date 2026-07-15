/**
 * UI wiring smoke test. Exercises AppProvider + router + reducer + OnboardingScreen
 * without any camera: the privacy step renders, "Continue" advances to the camera
 * step, and requesting the camera in an environment without `mediaDevices` fails
 * gracefully (typed error, no crash) rather than throwing.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../src/App";

describe("App onboarding wiring", () => {
  it("shows the privacy notice first", () => {
    render(<App />);
    expect(screen.getByText(/analyzes posture directly on this computer/i))
      .toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /continue/i }),
    ).toBeInTheDocument();
  });

  it("advances from privacy to the camera step on Continue", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(
      screen.getByRole("heading", { name: /enable your camera/i }),
    ).toBeInTheDocument();
  });

  it("handles a missing camera API gracefully (no crash, shows retry)", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /enable camera/i }));
    // jsdom has no navigator.mediaDevices → CameraManager returns a typed error
    // and the UI surfaces a "try again" affordance instead of throwing.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /try again/i }),
      ).toBeInTheDocument(),
    );
  });
});
