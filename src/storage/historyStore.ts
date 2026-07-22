/**
 * History facade used by the app. Always keeps an in-memory session aggregator
 * (so the dashboard works even in a plain browser), and — when a SQLite database
 * is available (native app) — persists session summaries, position events, and
 * calibration profiles through the repositories.
 *
 * Writes are periodic (the caller flushes ~once/min and at session end), never
 * per frame. No camera data is ever stored.
 */
import type { SpineDatabase } from "./database";
import type { WorkSessionRow, PositionEventRow } from "./schema";
import { SessionRepository, type SessionSummary } from "./sessionRepository";
import { EventRepository } from "./eventRepository";
import {
  CalibrationRepository,
  type CalibrationProfile,
} from "./calibrationRepository";
import { PlaceRepository, type Place } from "./placeRepository";
import type { SceneDescriptor } from "../position/sceneSignature";
import { SessionAggregator, type AggregatorSample } from "./sessionAggregator";
import {
  aggregateDay,
  aggregateDaily,
  startOfDay,
  type DayStats,
  type DailyStat,
} from "./dashboardMetrics";
import type { PositionEvent } from "../position/positionTypes";

function summaryToRow(s: SessionSummary): WorkSessionRow {
  return {
    id: 0,
    started_at: 0,
    ended_at: null,
    sitting_seconds: s.sittingSeconds,
    standing_seconds: s.standingSeconds,
    away_seconds: s.awaySeconds,
    unknown_seconds: s.unknownSeconds,
    good_posture_seconds: s.goodPostureSeconds,
    poor_posture_seconds: s.poorPostureSeconds,
    posture_notification_count: s.postureNotificationCount,
    position_notification_count: s.positionNotificationCount,
  };
}

const ACTIVE_PLACE_KEY = "spine-iq.place.active";

/** The default place created by migration (id 1). */
const DEFAULT_PLACE: Place = { id: 1, name: "My desk", descriptor: null };

export class HistoryStore {
  private readonly aggregator = new SessionAggregator();
  private db: SpineDatabase | null;
  private sessions: SessionRepository | null;
  private events: EventRepository | null;
  private calibrations: CalibrationRepository | null;
  private places: PlaceRepository | null;
  private sessionId: number | null = null;
  /** In-memory timeline mirror so the dashboard works without a DB. */
  private readonly localTimeline: PositionEventRow[] = [];
  private activePlace = DEFAULT_PLACE.id;
  private placeList: Place[] = [DEFAULT_PLACE];
  /** Most recent scene descriptor from the monitor (transient, in-memory). */
  private latestScene: SceneDescriptor | null = null;

  constructor(db: SpineDatabase | null = null) {
    this.db = db;
    this.sessions = db ? new SessionRepository(db) : null;
    this.events = db ? new EventRepository(db) : null;
    this.calibrations = db ? new CalibrationRepository(db) : null;
    this.places = db ? new PlaceRepository(db) : null;
  }

  /** Attach a database that became available asynchronously (native app). */
  attachDatabase(db: SpineDatabase): void {
    this.db = db;
    this.sessions = new SessionRepository(db);
    this.events = new EventRepository(db);
    this.calibrations = new CalibrationRepository(db);
    this.places = new PlaceRepository(db);
  }

  // ---- Places ---------------------------------------------------------------

  get activePlaceId(): number {
    return this.activePlace;
  }

  /** Cached place list (refreshed by initPlaces/createPlace). */
  get placesCache(): readonly Place[] {
    return this.placeList;
  }

  setLatestScene(descriptor: SceneDescriptor): void {
    this.latestScene = descriptor;
  }

  /** Whether the active place has been scene-fingerprinted yet. */
  get activePlaceHasDescriptor(): boolean {
    return (
      this.placeList.find((p) => p.id === this.activePlace)?.descriptor != null
    );
  }

  /**
   * Fingerprint the active place with the current scene (used to silently
   * adopt the first stable scene for a place created before fingerprinting
   * existed, e.g. the migrated default desk).
   */
  async adoptSceneForActivePlace(): Promise<void> {
    if (!this.latestScene || this.activePlaceHasDescriptor) return;
    if (this.places) {
      await this.places.updateDescriptor(
        this.activePlace,
        this.latestScene,
        Date.now(),
      );
    }
    this.placeList = this.placeList.map((p) =>
      p.id === this.activePlace ? { ...p, descriptor: this.latestScene } : p,
    );
  }

  /** Load places and restore the last active one. Call after attachDatabase. */
  async initPlaces(): Promise<{ places: readonly Place[]; active: Place }> {
    if (this.places) {
      const list = await this.places.list();
      if (list.length > 0) this.placeList = list;
    }
    let restored: number | null = null;
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(ACTIVE_PLACE_KEY);
      if (raw) restored = Number(raw) || null;
    }
    const active =
      this.placeList.find((p) => p.id === restored) ?? this.placeList[0] ?? DEFAULT_PLACE;
    this.activePlace = active.id;
    return { places: this.placeList, active };
  }

  /** Create a place, fingerprinted with the latest scene when available. */
  async createPlace(name: string, nowMs: number): Promise<Place> {
    if (!this.places) {
      const place: Place = {
        id: this.placeList.length + 1,
        name,
        descriptor: this.latestScene,
      };
      this.placeList = [...this.placeList, place];
      return place;
    }
    const place = await this.places.create(name, this.latestScene, nowMs);
    this.placeList = [...this.placeList, place];
    return place;
  }

  /**
   * Switch the active place. Splits the running session so time is attributed
   * to the right place, and optionally re-fingerprints the place with the
   * current scene (manual selection = ground truth about where we are).
   */
  async selectPlace(
    id: number,
    opts: { updateDescriptor?: boolean } = {},
  ): Promise<void> {
    if (id === this.activePlace) return;
    this.activePlace = id;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(ACTIVE_PLACE_KEY, String(id));
    }
    if (opts.updateDescriptor && this.places && this.latestScene) {
      await this.places.updateDescriptor(id, this.latestScene, Date.now());
      this.placeList = this.placeList.map((p) =>
        p.id === id ? { ...p, descriptor: this.latestScene } : p,
      );
    }
    // Attribute time correctly: close the old place's session, open a new one.
    if (this.sessionId !== null) {
      await this.flush(true);
      await this.startSession();
    }
  }

  get hasDatabase(): boolean {
    return this.db !== null;
  }

  /**
   * NOTE on clocks: callers drive the aggregator with performance.now() (a
   * monotonic clock, correct for durations), but anything PERSISTED must use
   * wall-clock epoch ms or "today" queries can never match. The store owns
   * that translation.
   */
  async startSession(): Promise<void> {
    this.aggregator.reset();
    this.localTimeline.length = 0;
    this.sessionId = this.sessions
      ? await this.sessions.create(Date.now(), this.activePlace)
      : null;
  }

  record(nowMs: number, sample: AggregatorSample): void {
    this.aggregator.record(nowMs, sample);
  }

  async flush(end = false): Promise<void> {
    if (this.sessions && this.sessionId !== null) {
      await this.sessions.save(
        this.sessionId,
        this.aggregator.summary(),
        end ? Date.now() : null,
      );
    }
  }

  async addPositionEvent(event: PositionEvent): Promise<void> {
    // event.atMs is on the monotonic clock; stamp storage with wall-clock.
    const at = Date.now();
    this.localTimeline.push({
      id: this.localTimeline.length + 1,
      previous_position: event.previous,
      new_position: event.next,
      confidence: event.confidence,
      source: event.source,
      created_at: at,
    });
    if (this.events) {
      await this.events.insertPositionEvent({ ...event, atMs: at });
    }
  }

  /** Save a calibration for the ACTIVE place. */
  /**
   * Detection accuracy from the user's own ratings. `falseAlarms` (flagged a
   * slouch that wasn't) vs `missed` (failed to flag a real slouch) says WHICH
   * way the model is failing, which is what tuning needs.
   */
  async loadFeedbackStats(sinceMs = 0): Promise<{
    total: number;
    correct: number;
    falseAlarms: number;
    missed: number;
    accuracy: number | null;
  }> {
    const empty = {
      total: 0,
      correct: 0,
      falseAlarms: 0,
      missed: 0,
      accuracy: null,
    };
    if (!this.events) return empty;
    const rows = await this.events.feedbackCounts(sinceMs);
    const count = (v: string): number =>
      rows.find((r) => r.verdict === v)?.n ?? 0;
    const correct = count("confirmed");
    const falseAlarms = count("false_positive");
    const missed = count("false_negative");
    const total = correct + falseAlarms + missed + count("misread");
    return {
      total,
      correct,
      falseAlarms,
      missed,
      accuracy: total === 0 ? null : correct / total,
    };
  }

  /** Record one posture-feedback verdict (labeled sample for future models). */
  async recordPostureFeedback(entry: {
    readonly verdict:
      | "false_positive"
      | "false_negative"
      | "confirmed"
      | "misread";
    readonly state: string;
    readonly score: number;
    readonly featuresJson: string | null;
  }): Promise<void> {
    if (!this.events) return;
    await this.events.insertPostureFeedback({
      verdict: entry.verdict,
      postureState: entry.state,
      smoothedScore: entry.score,
      featuresJson: entry.featuresJson,
      placeId: this.activePlace,
      atMs: Date.now(),
    });
  }

  async saveCalibration(profile: CalibrationProfile, nowMs: number): Promise<void> {
    if (this.calibrations) {
      await this.calibrations.save(profile, nowMs, this.activePlace);
    }
  }

  /** Load the active place's sitting/standing calibrations. */
  async loadCalibrations(): Promise<{
    sitting: CalibrationProfile | null;
    standing: CalibrationProfile | null;
  }> {
    if (!this.calibrations) return { sitting: null, standing: null };
    const [sitting, standing] = await Promise.all([
      this.calibrations.getLatest("sitting", this.activePlace),
      this.calibrations.getLatest("standing", this.activePlace),
    ]);
    return { sitting, standing };
  }

  async loadTodayStats(nowMs: number): Promise<DayStats> {
    if (this.sessions) {
      const rows = await this.sessions.listSince(startOfDay(nowMs));
      return aggregateDay(rows);
    }
    return aggregateDay([summaryToRow(this.aggregator.summary())]);
  }

  /** Per-day posture stats for the trailing `days` days (today last). */
  async loadDailyStats(nowMs: number, days = 14): Promise<DailyStat[]> {
    if (this.sessions) {
      const firstDay = startOfDay(nowMs) - (days - 1) * 86_400_000;
      const rows = await this.sessions.listSince(firstDay);
      return aggregateDaily(rows, nowMs, days);
    }
    // In-memory fallback: the current session counts as today.
    const row = { ...summaryToRow(this.aggregator.summary()), started_at: nowMs };
    return aggregateDaily([row], nowMs, days);
  }

  async loadTimeline(nowMs: number): Promise<PositionEventRow[]> {
    if (this.events) {
      return this.events.listPositionEventsSince(startOfDay(nowMs));
    }
    return [...this.localTimeline];
  }

  async deleteHistory(): Promise<void> {
    if (this.sessions) await this.sessions.deleteAll();
    if (this.events) await this.events.deleteAll();
    this.localTimeline.length = 0;
    this.aggregator.reset();
    this.sessionId = null;
  }

  async deleteCalibration(): Promise<void> {
    if (this.calibrations) await this.calibrations.deleteAll();
  }

  async exportSummary(nowMs: number): Promise<string> {
    const [stats, timeline] = await Promise.all([
      this.loadTodayStats(nowMs),
      this.loadTimeline(nowMs),
    ]);
    return JSON.stringify({ generatedAt: nowMs, stats, timeline }, null, 2);
  }
}
