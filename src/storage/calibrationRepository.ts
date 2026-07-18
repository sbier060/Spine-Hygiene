/**
 * Calibration persistence, so the user doesn't recalibrate every launch. Stores
 * one row per position type (latest wins), carrying both the posture-scoring
 * baseline and the position-classification baseline as JSON.
 */
import type { SpineDatabase } from "./database";
import type { CalibrationProfileRow } from "./schema";
import type { CalibrationBaseline } from "../posture/postureTypes";
import type { PositionBaseline } from "../position/positionCalibration";

export interface CalibrationProfile {
  readonly positionType: "sitting" | "standing";
  readonly postureBaseline: CalibrationBaseline | null;
  readonly positionBaseline: PositionBaseline | null;
}

export class CalibrationRepository {
  constructor(private readonly db: SpineDatabase) {}

  /** Insert (replacing any existing profile of the same type at this place). */
  async save(
    profile: CalibrationProfile,
    now: number,
    placeId: number,
  ): Promise<void> {
    const posture = profile.postureBaseline;
    await this.db.execute(
      "DELETE FROM calibration_profiles WHERE position_type = ? AND place_id = ?",
      [profile.positionType, placeId],
    );
    await this.db.execute(
      `INSERT INTO calibration_profiles
         (position_type, place_id, camera_device_id, baseline_features_json,
          feature_variance_json, camera_width, camera_height, confidence,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profile.positionType,
        placeId,
        posture?.cameraDeviceId ?? null,
        JSON.stringify(profile.postureBaseline),
        JSON.stringify(profile.positionBaseline),
        posture?.cameraWidth ?? 0,
        posture?.cameraHeight ?? 0,
        posture?.confidence ?? profile.positionBaseline?.confidence ?? 0,
        now,
        now,
      ],
    );
  }

  async getLatest(
    positionType: "sitting" | "standing",
    placeId: number,
  ): Promise<CalibrationProfile | null> {
    const rows = await this.db.select<CalibrationProfileRow>(
      `SELECT * FROM calibration_profiles
       WHERE position_type = ? AND place_id = ?
       ORDER BY updated_at DESC LIMIT 1`,
      [positionType, placeId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      positionType,
      postureBaseline: safeParse<CalibrationBaseline>(row.baseline_features_json),
      positionBaseline: safeParse<PositionBaseline>(row.feature_variance_json),
    };
  }

  async deleteAll(): Promise<void> {
    await this.db.execute("DELETE FROM calibration_profiles");
  }
}

function safeParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
