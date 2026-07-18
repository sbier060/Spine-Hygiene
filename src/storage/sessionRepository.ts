/**
 * Work-session persistence. A session is a monitoring run; we periodically write
 * its accumulated summary (seconds per state + notification counts) and finalize
 * it on end. Only derived numbers are stored — never frames.
 */
import type { SpineDatabase } from "./database";
import type { WorkSessionRow } from "./schema";

export interface SessionSummary {
  readonly sittingSeconds: number;
  readonly standingSeconds: number;
  readonly awaySeconds: number;
  readonly unknownSeconds: number;
  readonly goodPostureSeconds: number;
  readonly poorPostureSeconds: number;
  readonly postureNotificationCount: number;
  readonly positionNotificationCount: number;
}

export class SessionRepository {
  constructor(private readonly db: SpineDatabase) {}

  async create(startedAt: number, placeId: number | null = null): Promise<number> {
    const result = await this.db.execute(
      "INSERT INTO work_sessions (started_at, place_id) VALUES (?, ?)",
      [startedAt, placeId],
    );
    return result.lastInsertId ?? 0;
  }

  /** Write the current summary; pass `endedAt` to finalize the session. */
  async save(
    id: number,
    summary: SessionSummary,
    endedAt: number | null = null,
  ): Promise<void> {
    await this.db.execute(
      `UPDATE work_sessions SET
         ended_at = ?,
         sitting_seconds = ?,
         standing_seconds = ?,
         away_seconds = ?,
         unknown_seconds = ?,
         good_posture_seconds = ?,
         poor_posture_seconds = ?,
         posture_notification_count = ?,
         position_notification_count = ?
       WHERE id = ?`,
      [
        endedAt,
        Math.round(summary.sittingSeconds),
        Math.round(summary.standingSeconds),
        Math.round(summary.awaySeconds),
        Math.round(summary.unknownSeconds),
        Math.round(summary.goodPostureSeconds),
        Math.round(summary.poorPostureSeconds),
        summary.postureNotificationCount,
        summary.positionNotificationCount,
        id,
      ],
    );
  }

  /** Sessions started at/after `sinceMs`, oldest first. */
  listSince(sinceMs: number): Promise<WorkSessionRow[]> {
    return this.db.select<WorkSessionRow>(
      "SELECT * FROM work_sessions WHERE started_at >= ? ORDER BY started_at ASC",
      [sinceMs],
    );
  }

  async deleteAll(): Promise<void> {
    await this.db.execute("DELETE FROM work_sessions");
  }
}
