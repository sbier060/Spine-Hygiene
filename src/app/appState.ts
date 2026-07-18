/**
 * Application state for the Phase 1 detection sandbox. A single typed reducer —
 * no large global mutable store. UI reads state; the pose loop dispatches
 * readings. Business logic (scoring, calibration) lives in its own modules and
 * is only *invoked* from here.
 */
import type { Landmark } from "../pose/landmarkTypes";
import type { PostureFeatures } from "../pose/featureExtractor";
import type { DetectionQuality } from "../pose/poseQuality";
import type { CalibrationBaseline, PostureBand } from "../posture/postureTypes";
import type { CameraPermissionState } from "../camera/cameraTypes";
import type { MonitoringResult } from "../monitoring/monitoringController";
import type { MonitoringStatus } from "../monitoring/monitoringTypes";
import type { PositionBaseline } from "../position/positionCalibration";
import type { PositionState } from "../position/positionTypes";
import type { SpineIqError } from "../utils/errors";

/** Onboarding → calibration → sandbox → monitoring flow. */
export type AppPhase =
  | "privacy"
  | "profile"
  | "camera"
  | "placement"
  | "calibrate"
  | "calibrate_standing"
  | "sandbox"
  | "monitor"
  | "dashboard";

/** A pending manual position correction (consumed by the monitoring hook). */
export interface ManualMark {
  readonly position: PositionState;
  readonly nonce: number;
}

/** A distinct spot the user works from (desk, comfy chair, couch). */
export interface PlaceInfo {
  readonly id: number;
  readonly name: string;
}

/**
 * What the sandbox displays as the current status: a posture band, or
 * "low_confidence" when detection can't see enough of the user to judge
 * (out of frame, face turned, too dark).
 */
export type DisplayBand = PostureBand | "low_confidence";

/** One live posture reading for the dashboard/overlay. */
export interface LiveReading {
  readonly features: PostureFeatures;
  readonly landmarks: readonly Landmark[];
  readonly quality: DetectionQuality;
  readonly rawScore: number;
  readonly smoothedScore: number;
  readonly band: DisplayBand;
  readonly inferenceMs: number;
}

export interface AppState {
  readonly phase: AppPhase;
  readonly devMode: boolean;
  readonly cameraPermission: CameraPermissionState;
  readonly baseline: CalibrationBaseline | null;
  readonly positionBaselineSitting: PositionBaseline | null;
  readonly positionBaselineStanding: PositionBaseline | null;
  readonly latest: LiveReading | null;
  readonly monitoringStatus: MonitoringStatus;
  readonly monitor: MonitoringResult | null;
  readonly manualMark: ManualMark | null;
  /** Per-user posture sensitivity (deviation saturation) from two-point training. */
  readonly postureSaturation: number;
  readonly places: readonly PlaceInfo[];
  readonly activePlace: PlaceInfo | null;
  readonly error: SpineIqError | null;
}

export const initialAppState: AppState = {
  phase: "privacy",
  devMode: false,
  cameraPermission: "unknown",
  baseline: null,
  positionBaselineSitting: null,
  positionBaselineStanding: null,
  latest: null,
  monitoringStatus: { kind: "stopped" },
  monitor: null,
  manualMark: null,
  postureSaturation: 4,
  places: [],
  activePlace: null,
  error: null,
};

export type AppAction =
  | { type: "set_phase"; phase: AppPhase }
  | { type: "set_permission"; permission: CameraPermissionState }
  | { type: "set_baseline"; baseline: CalibrationBaseline }
  | { type: "set_position_baseline"; baseline: PositionBaseline }
  | { type: "set_reading"; reading: LiveReading }
  | { type: "set_monitor"; monitor: MonitoringResult }
  | { type: "start_monitoring" }
  | { type: "pause_monitoring"; untilMs: number | null }
  | { type: "resume_monitoring" }
  | { type: "mark_position"; position: PositionState }
  | { type: "set_saturation"; value: number }
  | { type: "set_places"; places: readonly PlaceInfo[] }
  | { type: "set_active_place"; place: PlaceInfo }
  | { type: "set_error"; error: SpineIqError | null }
  | { type: "toggle_dev" };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "set_phase":
      return { ...state, phase: action.phase, error: null };
    case "set_permission":
      return { ...state, cameraPermission: action.permission };
    case "set_baseline":
      return { ...state, baseline: action.baseline };
    case "set_position_baseline":
      return action.baseline.positionType === "standing"
        ? { ...state, positionBaselineStanding: action.baseline }
        : { ...state, positionBaselineSitting: action.baseline };
    case "set_reading":
      return { ...state, latest: action.reading };
    case "set_monitor":
      return { ...state, monitor: action.monitor };
    case "start_monitoring":
      return {
        ...state,
        phase: "monitor",
        monitoringStatus: { kind: "running" },
        error: null,
      };
    case "pause_monitoring":
      return {
        ...state,
        monitoringStatus: { kind: "paused", untilMs: action.untilMs },
      };
    case "resume_monitoring":
      return { ...state, monitoringStatus: { kind: "running" } };
    case "mark_position":
      return {
        ...state,
        manualMark: {
          position: action.position,
          nonce: (state.manualMark?.nonce ?? 0) + 1,
        },
      };
    case "set_saturation":
      return { ...state, postureSaturation: action.value };
    case "set_places":
      return { ...state, places: action.places };
    case "set_active_place":
      return { ...state, activePlace: action.place };
    case "set_error":
      return { ...state, error: action.error };
    case "toggle_dev":
      return { ...state, devMode: !state.devMode };
    default:
      return state;
  }
}
