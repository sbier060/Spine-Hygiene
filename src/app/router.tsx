/**
 * Phase-driven screen router for Phase 1. Maps the app phase to a screen; there
 * is no URL routing yet (the app is a single window driven by state).
 */
import { useAppContext } from "./AppProvider";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { CalibrationScreen } from "../screens/CalibrationScreen";
import { DevSandboxScreen } from "../screens/DevSandboxScreen";
import { MonitorScreen } from "../screens/MonitorScreen";
import type { CameraInfo } from "../hooks/usePoseLoop";

export function AppRouter({
  videoRef,
  cameraInfoRef,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  cameraInfoRef: React.MutableRefObject<CameraInfo | null>;
}): JSX.Element {
  const { state } = useAppContext();
  switch (state.phase) {
    case "privacy":
    case "camera":
    case "placement":
      return <OnboardingScreen videoRef={videoRef} />;
    case "calibrate":
      return (
        <CalibrationScreen
          videoRef={videoRef}
          cameraInfoRef={cameraInfoRef}
          positionType="sitting"
        />
      );
    case "calibrate_standing":
      return (
        <CalibrationScreen
          videoRef={videoRef}
          cameraInfoRef={cameraInfoRef}
          positionType="standing"
        />
      );
    case "sandbox":
      return <DevSandboxScreen videoRef={videoRef} />;
    case "monitor":
      return <MonitorScreen />;
    default:
      return <OnboardingScreen videoRef={videoRef} />;
  }
}
