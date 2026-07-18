/**
 * Posture- and position-event persistence. Position events power the dashboard
 * timeline; posture events record when drift/poor episodes happened.
 */
import type { SpineDatabase } from "./database";
import type { PositionEventRow } from "./schema";
import type { PositionEvent } from "../position/positionTypes";

export interface PostureEventInput {
  readonly eventType: string;
  readonly startedAt: number;
  readonly resolvedAt?: number | null;
  readonly severity?: string | null;
  readonly postureScore?: number | null;
  readonly positionState?: string | null;
  readonly notificationSent: boolean;
  readonly metadata?: Record<string, unknown> | null;
}

export class EventRepository {
  constructor(private readonly db: SpineDatabase) {}

  async insertPositionEvent(event: PositionEvent): Promise<void> {
    await this.db.execute(
      `INSERT INTO position_events
         (previous_position, new_position, confidence, source, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [event.previous, event.next, event.confidence, event.source, event.atMs],
    );
  }

  async insertPostureEvent(event: PostureEventInput): Promise<void> {
    await this.db.execute(
      `INSERT INTO posture_events
         (event_type, started_at, resolved_at, severity, posture_score,
          position_state, notification_sent, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.eventType,
        event.startedAt,
        event.resolvedAt ?? null,
        event.severity ?? null,
        event.postureScore ?? null,
        event.positionState ?? null,
        event.notificationSent ? 1 : 0,
        event.metadata ? JSON.stringify(event.metadata) : null,
      ],
    );
  }

  /** Position changes at/after `sinceMs`, oldest first (dashboard timeline). */
  listPositionEventsSince(sinceMs: number): Promise<PositionEventRow[]> {
    return this.db.select<PositionEventRow>(
      "SELECT * FROM position_events WHERE created_at >= ? ORDER BY created_at ASC",
      [sinceMs],
    );
  }

  /** One labeled feedback sample — the training data for future models. */
  async insertPostureFeedback(entry: {
    readonly verdict: string;
    readonly postureState: string;
    readonly smoothedScore: number;
    readonly featuresJson: string | null;
    readonly placeId: number | null;
    readonly atMs: number;
  }): Promise<void> {
    await this.db.execute(
      `INSERT INTO posture_feedback
         (verdict, posture_state, smoothed_score, features_json, place_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.verdict,
        entry.postureState,
        entry.smoothedScore,
        entry.featuresJson,
        entry.placeId,
        entry.atMs,
      ],
    );
  }

  async deleteAll(): Promise<void> {
    await this.db.execute("DELETE FROM position_events");
    await this.db.execute("DELETE FROM posture_events");
    await this.db.execute("DELETE FROM posture_feedback");
  }
}
