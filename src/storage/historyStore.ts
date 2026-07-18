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

export class HistoryStore {
  private readonly aggregator = new SessionAggregator();
  private db: SpineDatabase | null;
  private sessions: SessionRepository | null;
  private events: EventRepository | null;
  private calibrations: CalibrationRepository | null;
  private sessionId: number | null = null;
  /** In-memory timeline mirror so the dashboard works without a DB. */
  private readonly localTimeline: PositionEventRow[] = [];

  constructor(db: SpineDatabase | null = null) {
    this.db = db;
    this.sessions = db ? new SessionRepository(db) : null;
    this.events = db ? new EventRepository(db) : null;
    this.calibrations = db ? new CalibrationRepository(db) : null;
  }

  /** Attach a database that became available asynchronously (native app). */
  attachDatabase(db: SpineDatabase): void {
    this.db = db;
    this.sessions = new SessionRepository(db);
    this.events = new EventRepository(db);
    this.calibrations = new CalibrationRepository(db);
  }

  get hasDatabase(): boolean {
    return this.db !== null;
  }

  async startSession(nowMs: number): Promise<void> {
    this.aggregator.reset();
    this.localTimeline.length = 0;
    this.sessionId = this.sessions ? await this.sessions.create(nowMs) : null;
  }

  record(nowMs: number, sample: AggregatorSample): void {
    this.aggregator.record(nowMs, sample);
  }

  async flush(nowMs: number, end = false): Promise<void> {
    if (this.sessions && this.sessionId !== null) {
      await this.sessions.save(
        this.sessionId,
        this.aggregator.summary(),
        end ? nowMs : null,
      );
    }
  }

  async addPositionEvent(event: PositionEvent): Promise<void> {
    this.localTimeline.push({
      id: this.localTimeline.length + 1,
      previous_position: event.previous,
      new_position: event.next,
      confidence: event.confidence,
      source: event.source,
      created_at: event.atMs,
    });
    if (this.events) await this.events.insertPositionEvent(event);
  }

  async saveCalibration(profile: CalibrationProfile, nowMs: number): Promise<void> {
    if (this.calibrations) await this.calibrations.save(profile, nowMs);
  }

  /** Load the latest saved sitting/standing calibration (for restore on launch). */
  async loadCalibrations(): Promise<{
    sitting: CalibrationProfile | null;
    standing: CalibrationProfile | null;
  }> {
    if (!this.calibrations) return { sitting: null, standing: null };
    const [sitting, standing] = await Promise.all([
      this.calibrations.getLatest("sitting"),
      this.calibrations.getLatest("standing"),
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
