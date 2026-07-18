/**
 * useMonitoring — the Phase 2 background monitor. Runs an ADAPTIVE inference loop
 * (rescheduling each tick from the controller's chosen interval), fires calm
 * posture notifications, and keeps the native tray status in sync. When paused it
 * stops the camera so CPU approaches zero.
 *
 * All decision-making lives in MonitoringController (pure, tested). This hook is
 * the effectful shell: camera, worker, timers, notifications, tray.
 */
import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { CameraManager } from "../camera/cameraManager";
import { captureFrameBitmap } from "../camera/frameSampler";
import { PoseEngine } from "../pose/poseLandmarker";
import type { Landmark } from "../pose/landmarkTypes";
import { extractPositionFeatures } from "../position/positionFeatures";
import { PositionCalibrationCollector } from "../position/positionCalibration";
import { MonitoringController } from "../monitoring/monitoringController";
import type { PostureMachineConfig } from "../posture/postureStateMachine";
import { DEFAULT_POSTURE_MACHINE_CONFIG } from "../posture/postureStateMachine";
import type { ScoreOptions } from "../posture/postureScorer";
import { NotificationService } from "../notifications/notificationService";
import {
  postureNotification,
  sittingNotification,
  standingNotification,
} from "../notifications/interventionRules";
import {
  statusHeadline,
  positionLabel,
  trayTone,
  formatDuration,
} from "../tray/trayState";
import { updateTrayStatus, setPostureAlert } from "../tray/trayCommands";
import { speak, slouchLine } from "../audio/voice";
import { SettingsRepository } from "../storage/settingsRepository";
import { StickyValue } from "../pose/smoothing";
import type { CalibrationBaseline, PostureState } from "../posture/postureTypes";
import type { PositionBaseline } from "../position/positionCalibration";
import type { PositionState } from "../position/positionTypes";
import type { HistoryStore } from "../storage/historyStore";
import { isSpineIqError } from "../utils/errors";
import type { AppAction, ManualMark } from "../app/appState";

/** Persist the session summary at most this often (never per frame). */
const FLUSH_INTERVAL_MS = 60_000;

/**
 * A new posture state must hold this long before the DISPLAYED status (tray +
 * screen) changes, so brief movement never flickers the label. Alert and pause
 * states switch instantly — presentation smoothing must never delay the red
 * popup.
 */
const STATUS_HOLD_MS = 4000;
const IMMEDIATE_STATES: readonly PostureState[] = [
  "poor_confirmed",
  "cooldown",
  "paused",
];

/** Verbose monitoring diagnostics to the console (dev only). */
const DEBUG_MONITOR = true;
function dbg(...args: unknown[]): void {
  if (DEBUG_MONITOR) console.log("[spine-iq/monitor]", ...args);
}

export interface MonitoringOptions {
  readonly machineConfig?: PostureMachineConfig;
  readonly scoreOptions?: ScoreOptions;
}

export interface MonitoringBaselines {
  readonly posture: CalibrationBaseline | null;
  readonly positionSitting: PositionBaseline | null;
  readonly positionStanding: PositionBaseline | null;
}

export function useMonitoring(
  videoRef: React.RefObject<HTMLVideoElement>,
  running: boolean,
  paused: boolean,
  baselines: MonitoringBaselines,
  manualMark: ManualMark | null,
  history: HistoryStore,
  dispatch: Dispatch<AppAction>,
  options: MonitoringOptions = {},
): void {
  const cameraRef = useRef<CameraManager | null>(null);
  const engineRef = useRef<PoseEngine | null>(null);
  const controllerRef = useRef<MonitoringController | null>(null);
  const notifierRef = useRef<NotificationService | null>(null);
  const rotationRef = useRef(0);
  const stateEnteredMsRef = useRef(0);
  const lastStateRef = useRef<PostureState>("good");
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const baselinesRef = useRef<MonitoringBaselines>(baselines);
  baselinesRef.current = baselines;
  const historyRef = useRef<HistoryStore>(history);
  historyRef.current = history;
  // When the user corrects the position, learn their real sitting/standing
  // signature (height + apparent size in frame) so it auto-detects afterward.
  const learnRef = useRef<{
    position: "sitting" | "standing";
    collector: PositionCalibrationCollector;
  } | null>(null);
  const alertActiveRef = useRef(false);
  const voiceRotationRef = useRef(0);
  const settingsRepoRef = useRef<SettingsRepository | null>(null);
  settingsRepoRef.current ??= new SettingsRepository();
  const stickyStateRef = useRef(
    new StickyValue<PostureState>("good", STATUS_HOLD_MS, IMMEDIATE_STATES),
  );
  const configRef = useRef<PostureMachineConfig>(
    options.machineConfig ?? DEFAULT_POSTURE_MACHINE_CONFIG,
  );
  const scoreOptionsRef = useRef<ScoreOptions>(options.scoreOptions ?? {});

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastFlushMs = 0;

    const camera = (cameraRef.current ??= new CameraManager());
    const engine = (engineRef.current ??= new PoseEngine());
    const controller = (controllerRef.current ??= new MonitoringController({
      machineConfig: configRef.current,
      scoreOptions: scoreOptionsRef.current,
    }));
    const notifier = (notifierRef.current ??= new NotificationService());

    function scheduleNext(delayMs: number | null): void {
      if (cancelled) return;
      if (delayMs === null) {
        // Paused/stopped from the scheduler's perspective: release the camera.
        camera.stop();
        const video = videoRef.current;
        if (video) video.srcObject = null;
        // Poll occasionally so we can resume when unpaused.
        timer = setTimeout(() => void tick(), 1000);
        return;
      }
      timer = setTimeout(() => void tick(), delayMs);
    }

    async function tick(): Promise<void> {
      if (cancelled) return;
      const now = performance.now();

      if (pausedRef.current) {
        const b = baselinesRef.current;
        const result = controller.ingest({
          nowMs: now,
          landmarks: [],
          baseline: b.posture,
          sittingPositionBaseline: b.positionSitting,
          standingPositionBaseline: b.positionStanding,
          paused: true,
          inferenceMs: 0,
        });
        stickyStateRef.current.update(result.state, now);
        dispatch({ type: "set_monitor", monitor: result });
        historyRef.current.record(now, {
          position: result.position,
          postureState: result.state,
          postureNotified: false,
          positionNotified: false,
          paused: true,
        });
        if (alertActiveRef.current) {
          alertActiveRef.current = false;
          void setPostureAlert(false);
        }
        void syncTray(result.state, result.position, now);
        void scheduleNext(null);
        return;
      }

      // Ensure the camera is live (it may have been released while paused).
      if (!camera.isActive) {
        dbg("camera not active → starting");
        const started = await camera.start();
        if (cancelled) return;
        if (!started.ok) {
          dbg("camera start FAILED", started.error);
          dispatch({ type: "set_error", error: started.error });
          void scheduleNext(2000);
          return;
        }
        dbg("camera started", started.value.width, "x", started.value.height);
        controller.setCameraResolution(started.value.width, started.value.height);
      }

      // ALWAYS ensure the <video> is showing the active stream. On React's dev
      // double-mount the camera can already be active while the video was never
      // (re)attached, which silently starved the loop of frames.
      const active = camera.current;
      {
        const video = videoRef.current;
        if (active && video && video.srcObject !== active.stream) {
          video.srcObject = active.stream;
          try {
            await video.play();
            dbg("attached stream; video.play() ok; readyState", video.readyState);
          } catch (err) {
            dbg("video.play() REJECTED", err, "paused?", video.paused);
          }
        }
      }

      let landmarks: readonly Landmark[] = [];
      let inferenceMs = 0;
      const video = videoRef.current;
      if (video) {
        try {
          const bitmap = await captureFrameBitmap(video);
          if (!bitmap) {
            dbg("no bitmap; readyState", video.readyState, "vw", video.videoWidth, "paused", video.paused, "srcObject?", video.srcObject !== null);
          }
          if (bitmap && !cancelled) {
            const frame = await engine.detect(bitmap, now);
            landmarks = frame.landmarks;
            inferenceMs = frame.inferenceMs;
            dbg("detect ok; landmarks", landmarks.length, "inferenceMs", inferenceMs.toFixed(1));
          }
        } catch (err) {
          dbg("detect/capture ERROR", err);
          if (isSpineIqError(err) && err.type === "model_load_failed") {
            dispatch({ type: "set_error", error: err });
          }
        }
      }

      const b = baselinesRef.current;
      const result = controller.ingest({
        nowMs: now,
        landmarks,
        baseline: b.posture,
        sittingPositionBaseline: b.positionSitting,
        standingPositionBaseline: b.positionStanding,
        paused: false,
        inferenceMs,
      });
      // Present a debounced state so the tray/screen don't flap on brief
      // movement; the raw state still drives notifications and scheduling.
      const displayState = stickyStateRef.current.update(result.state, now);
      dispatch({
        type: "set_monitor",
        monitor: { ...result, state: displayState },
      });
      dbg(
        "tick →",
        "present:", result.present,
        "state:", result.state,
        "shown:", displayState,
        "pos:", result.position,
        "nextMs:", result.nextIntervalMs,
      );

      // Learn the corrected position's signature from a few good frames.
      const learn = learnRef.current;
      if (learn && result.present && result.usable && landmarks.length > 0) {
        learn.collector.add(extractPositionFeatures(landmarks), {
          score: result.confidence,
          usable: true,
          reason: null,
        });
        if (learn.collector.validSampleCount >= LEARN_SAMPLES) {
          const positionBaseline = learn.collector.build(learn.position);
          dispatch({ type: "set_position_baseline", baseline: positionBaseline });
          // Keep the sitting posture baseline; standing needs no posture baseline.
          const postureForSave =
            learn.position === "sitting"
              ? baselinesRef.current.posture
              : null;
          void historyRef.current.saveCalibration(
            {
              positionType: learn.position,
              postureBaseline: postureForSave,
              positionBaseline,
            },
            Date.now(),
          );
          dbg("learned", learn.position, "signature:", positionBaseline.features);
          learnRef.current = null;
        }
      }

      const gate = {
        paused: false,
        away: false,
        onboarding: false,
        screenLocked: false,
        inCooldown: false,
      };
      if (result.notify) {
        rotationRef.current += 1;
        void notifier.notify(postureNotification(rotationRef.current), gate);
      }
      if (result.positionReminder === "sitting") {
        void notifier.notify(
          sittingNotification(Math.round(result.durations.currentMs / 60_000)),
          gate,
        );
      } else if (result.positionReminder === "standing") {
        void notifier.notify(
          standingNotification(Math.round(result.durations.currentMs / 60_000)),
          gate,
        );
      }

      // Persist: accumulate in memory, write summary at most once/min.
      const store = historyRef.current;
      store.record(now, {
        position: result.position,
        postureState: result.state,
        postureNotified: result.notify,
        positionNotified: result.positionReminder !== null,
        paused: false,
      });
      if (result.positionEvent) void store.addPositionEvent(result.positionEvent);
      if (now - lastFlushMs >= FLUSH_INTERVAL_MS) {
        lastFlushMs = now;
        void store.flush(now);
      }

      // Big red alert: pop the window to the front while slouching is confirmed,
      // and drop it once posture recovers. Driven by the displayed state: alert
      // entry is immediate (alert states bypass the hold), and recovery keeps
      // the popup up for the hold so it never flashes away on one good frame.
      const shouldAlert =
        displayState === "poor_confirmed" || displayState === "cooldown";
      if (shouldAlert !== alertActiveRef.current) {
        alertActiveRef.current = shouldAlert;
        void setPostureAlert(shouldAlert);
        // Speak once per slouch episode, personalized from the user's profile.
        if (shouldAlert) {
          const s = settingsRepoRef.current?.load();
          if (s?.voiceEnabled) {
            void speak(slouchLine(s, voiceRotationRef.current));
            voiceRotationRef.current += 1;
          }
        }
      }

      void syncTray(displayState, result.position, now);
      void scheduleNext(result.nextIntervalMs);
    }

    async function syncTray(
      state: PostureState,
      position: PositionState,
      now: number,
    ): Promise<void> {
      if (state !== lastStateRef.current) {
        lastStateRef.current = state;
        stateEnteredMsRef.current = now;
      }
      await updateTrayStatus({
        postureLabel: statusHeadline(state, position),
        positionLabel: positionLabel(position),
        durationLabel: formatDuration(now - stateEnteredMsRef.current),
        tone: pausedRef.current ? "paused" : trayTone(state),
      });
    }

    async function startup(): Promise<void> {
      await notifier.ensurePermission();
      // The monitor uses its own pose engine — it must be initialized before the
      // first detect (this was the "pose engine not initialized" error).
      try {
        await engine.init();
        dbg("pose engine initialized");
      } catch (err) {
        dbg("pose engine init FAILED", err);
        if (isSpineIqError(err)) dispatch({ type: "set_error", error: err });
        return;
      }
      if (cancelled) return;
      await historyRef.current.startSession(performance.now());
      if (!cancelled) void tick();
    }

    void startup();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      // Finalize the session summary on stop; drop any active alert.
      void historyRef.current.flush(performance.now(), true);
      if (alertActiveRef.current) {
        alertActiveRef.current = false;
        void setPostureAlert(false);
      }
    };
  }, [running, videoRef, dispatch]);

  // Stop the camera fully whenever monitoring isn't running.
  useEffect(() => {
    if (running) return;
    cameraRef.current?.stop();
    controllerRef.current?.reset();
    stickyStateRef.current.reset("good");
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, [running, videoRef]);

  // Apply manual sitting/standing corrections immediately, and start learning
  // that position's signature so classification becomes automatic afterward.
  useEffect(() => {
    if (!manualMark) return;
    controllerRef.current?.markPosition(manualMark.position, performance.now());
    if (manualMark.position === "sitting" || manualMark.position === "standing") {
      learnRef.current = {
        position: manualMark.position,
        collector: new PositionCalibrationCollector(),
      };
      dbg("learning", manualMark.position, "from your correction…");
    }
  }, [manualMark]);
}

/** Frames to gather before a learned position baseline is trusted
 * (>= MIN_POSITION_SAMPLES so buildPositionBaseline keeps the features). */
const LEARN_SAMPLES = 8;
