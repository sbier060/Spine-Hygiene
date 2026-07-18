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
import { captureFrameBitmap, captureGrayFrame } from "../camera/frameSampler";
import {
  computeBackgroundMotion,
  personExclusionFromLandmarks,
  type BackgroundMotionFeatures,
  type GrayFrame,
} from "../position/backgroundMotion";
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
import { systemIdleSeconds } from "../system/systemIdle";
import {
  computeSceneDescriptor,
  classifyPlace,
} from "../position/sceneSignature";
import { applyPlaceSwitch, isNewPlaceSnoozed } from "../app/placeActions";
import { isTauriRuntime } from "../storage/database";
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

/**
 * Away-standby: once the user has been away this long, release the camera
 * entirely (green light OFF). Input activity wakes it instantly; a failsafe
 * camera peek runs once a minute in case they return without touching anything.
 */
const STANDBY_AFTER_AWAY_MS = 4_000;
const STANDBY_POLL_MS = 3000;
/** Input within this window counts as "the user is back". */
const STANDBY_WAKE_IDLE_S = 2.5;
/**
 * Never release the camera while the keyboard/mouse is active: an undetected
 * but typing user is a lighting problem, not an absence.
 */
const STANDBY_MIN_INPUT_IDLE_S = 15;
/** Polls between failsafe camera peeks (20 × 3s = 60s). */
const STANDBY_FAILSAFE_POLLS = 20;

/** A different place's scene must match this long before auto-switching. */
const PLACE_SWITCH_SUSTAIN_MS = 15_000;

/** An unrecognized scene must persist this long before offering "new spot". */
const NEW_PLACE_SUSTAIN_MS = 30_000;

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
  slouchAck: number,
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
  // Previous grayscale frame for background-motion tracking, and the learned
  // desk-direction mapping (read live by the controller).
  const prevGrayRef = useRef<GrayFrame | null>(null);
  const mappingRef = useRef<boolean | null>(null);
  mappingRef.current ??=
    settingsRepoRef.current.load().backgroundDownMeansStanding;
  // Away-standby bookkeeping: when away began, and how many standby polls ran.
  const awaySinceRef = useRef<number | null>(null);
  const standbyPollsRef = useRef(0);
  // Place auto-detection: a different place must match sustainedly to switch.
  const placeCandidateRef = useRef<{ id: number; sinceMs: number } | null>(null);
  const placeSwitchingRef = useRef(false);
  // Unknown-scene detection → "looks like a new spot" flow.
  const unknownSceneSinceRef = useRef<number | null>(null);
  const newPlaceHintedRef = useRef(false);
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
      getBackgroundDownMeansStanding: () => mappingRef.current ?? true,
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
        // Camera is released while paused — a stale previous frame must never
        // be compared against a post-resume frame.
        prevGrayRef.current = null;
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
        prevGrayRef.current = null;
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

      // Background motion: compare this frame's downscaled luma against the
      // previous one, excluding the region the user occupies. Detects the
      // desk (and camera) physically moving — the strongest sit/stand signal.
      let backgroundMotion: BackgroundMotionFeatures | null = null;
      if (video) {
        const gray = captureGrayFrame(video);
        if (gray) {
          const exclusion = personExclusionFromLandmarks(landmarks);
          const prev = prevGrayRef.current;
          if (prev && prev.width === gray.width && prev.height === gray.height) {
            backgroundMotion = computeBackgroundMotion(prev, gray, exclusion);
          }
          prevGrayRef.current = gray;

          // Place detection: fingerprint the scene and — when it sustainedly
          // matches a DIFFERENT saved place — switch to it (swapping in that
          // place's calibrations). Skips while the desk itself is moving.
          const scene = computeSceneDescriptor(gray, exclusion);
          if (scene) {
            historyRef.current.setLatestScene(scene);
            const stableScene = backgroundMotion?.backgroundStable ?? true;
            if (stableScene && !placeSwitchingRef.current) {
              // A place created before fingerprinting existed (the migrated
              // default desk) silently adopts the first stable scene.
              if (!historyRef.current.activePlaceHasDescriptor) {
                if (landmarks.length > 0) {
                  dbg("adopting current scene for the active place");
                  void historyRef.current.adoptSceneForActivePlace();
                }
              } else {
                const match = classifyPlace(scene, historyRef.current.placesCache);
                if (match !== null && match !== historyRef.current.activePlaceId) {
                  unknownSceneSinceRef.current = null;
                  const cand = placeCandidateRef.current;
                  if (cand?.id !== match) {
                    placeCandidateRef.current = { id: match, sinceMs: now };
                  } else if (now - cand.sinceMs >= PLACE_SWITCH_SUSTAIN_MS) {
                    placeCandidateRef.current = null;
                    placeSwitchingRef.current = true;
                    const placeName = historyRef.current.placesCache.find(
                      (p) => p.id === match,
                    )?.name;
                    dbg("scene matches place →", placeName, "— switching");
                    void applyPlaceSwitch(historyRef.current, dispatch, match)
                      .finally(() => {
                        placeSwitchingRef.current = false;
                      });
                  }
                } else if (match === null && landmarks.length > 0) {
                  // Scene matches NO saved place: after sustained evidence,
                  // offer the "new spot" setup flow (snoozable).
                  placeCandidateRef.current = null;
                  unknownSceneSinceRef.current ??= now;
                  if (
                    !newPlaceHintedRef.current &&
                    now - unknownSceneSinceRef.current >= NEW_PLACE_SUSTAIN_MS &&
                    !isNewPlaceSnoozed(Date.now())
                  ) {
                    newPlaceHintedRef.current = true;
                    dbg("unknown scene sustained → suggesting new place");
                    dispatch({ type: "set_new_place_hint", value: true });
                  }
                } else {
                  placeCandidateRef.current = null;
                  unknownSceneSinceRef.current = null;
                  newPlaceHintedRef.current = false;
                }
              }
            }
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
        backgroundMotion,
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
        void store.flush();
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
            void speak(slouchLine(s, voiceRotationRef.current), s.voiceName);
            voiceRotationRef.current += 1;
          }
        }
      }

      void syncTray(displayState, result.position, now);

      // Away-standby: after sustained absence, release the camera entirely so
      // the green light goes off. Input activity (or the failsafe peek) wakes it.
      if (result.state === "away" && isTauriRuntime()) {
        awaySinceRef.current ??= now;
        if (now - awaySinceRef.current >= STANDBY_AFTER_AWAY_MS) {
          // Guard: recent keyboard/mouse input means they're at the desk even
          // if the camera can't see them — keep watching instead of sleeping.
          const idle = await systemIdleSeconds();
          if (idle === null || idle >= STANDBY_MIN_INPUT_IDLE_S) {
            dbg("away sustained + input idle → releasing camera (standby)");
            camera.stop();
            const v = videoRef.current;
            if (v) v.srcObject = null;
            prevGrayRef.current = null;
            standbyPollsRef.current = 0;
            timer = setTimeout(() => void standbyTick(), STANDBY_POLL_MS);
            return;
          }
          dbg("away but input active — keeping camera on");
        }
      } else {
        awaySinceRef.current = null;
      }

      void scheduleNext(result.nextIntervalMs);
    }

    /**
     * Camera-off standby loop: poll system input idle instead of frames. Wake
     * on input, or peek with the camera once a minute as a failsafe (also
     * covers the case where input idle isn't readable).
     */
    async function standbyTick(): Promise<void> {
      if (cancelled) return;
      const now = performance.now();
      if (pausedRef.current) {
        // Pause takes over its own camera-released path.
        awaySinceRef.current = null;
        void tick();
        return;
      }
      historyRef.current.record(now, {
        position: "away",
        postureState: "away",
        postureNotified: false,
        positionNotified: false,
        paused: false,
      });
      standbyPollsRef.current += 1;
      const idle = await systemIdleSeconds();
      if (cancelled) return;
      const inputWake = idle !== null && idle < STANDBY_WAKE_IDLE_S;
      const failsafeWake =
        standbyPollsRef.current >= STANDBY_FAILSAFE_POLLS;
      if (inputWake || failsafeWake) {
        dbg(
          inputWake
            ? "input detected → waking camera"
            : "standby failsafe → camera peek",
        );
        awaySinceRef.current = null;
        void tick(); // camera restarts inside the normal loop
        return;
      }
      timer = setTimeout(() => void standbyTick(), STANDBY_POLL_MS);
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
      await historyRef.current.startSession();
      if (!cancelled) void tick();
    }

    void startup();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      // Finalize the session summary on stop; drop any active alert.
      void historyRef.current.flush(true);
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

  // "I fixed my posture": end the slouch episode everywhere at once — state
  // machine, sticky display, window pin, and the native alert flag.
  const lastAckRef = useRef(slouchAck);
  useEffect(() => {
    if (slouchAck === lastAckRef.current) return;
    lastAckRef.current = slouchAck;
    controllerRef.current?.acknowledgeSlouch();
    stickyStateRef.current.force("good");
    if (alertActiveRef.current) {
      alertActiveRef.current = false;
      void setPostureAlert(false);
    }
    dbg("slouch acknowledged by user");
  }, [slouchAck]);

  // Apply manual sitting/standing corrections immediately, and start learning
  // that position's signature so classification becomes automatic afterward.
  useEffect(() => {
    if (!manualMark) return;
    const now = performance.now();
    controllerRef.current?.markPosition(manualMark.position, now);
    // Direction-mapping learning: a correction shortly after a desk transition
    // tells us which background direction means standing on THIS setup.
    const lastTransition = controllerRef.current?.lastCompletedTransition ?? null;
    if (
      lastTransition &&
      now - lastTransition.atMs < 30_000 &&
      (manualMark.position === "sitting" || manualMark.position === "standing")
    ) {
      const downMeansStanding =
        lastTransition.direction === "background_down"
          ? manualMark.position === "standing"
          : manualMark.position === "sitting";
      if (downMeansStanding !== mappingRef.current) {
        mappingRef.current = downMeansStanding;
        settingsRepoRef.current?.update({
          backgroundDownMeansStanding: downMeansStanding,
        });
        dbg("learned desk mapping: backgroundDownMeansStanding =", downMeansStanding);
      }
    }
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
