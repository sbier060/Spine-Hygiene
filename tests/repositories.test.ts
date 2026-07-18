import { describe, it, expect } from "vitest";
import { FakeDatabase } from "./fakeDatabase";
import { runMigrations } from "../src/storage/database";
import { SCHEMA_STATEMENTS } from "../src/storage/schema";
import { SessionRepository } from "../src/storage/sessionRepository";
import { EventRepository } from "../src/storage/eventRepository";
import { CalibrationRepository } from "../src/storage/calibrationRepository";

describe("runMigrations", () => {
  it("executes every schema statement plus the tolerated migrations", async () => {
    const db = new FakeDatabase();
    await runMigrations(db);
    expect(db.executed.length).toBeGreaterThanOrEqual(SCHEMA_STATEMENTS.length);
    expect(db.executed.some((e) => e.sql.includes("places"))).toBe(true);
  });
});

describe("SessionRepository", () => {
  it("creates a session and returns the insert id", async () => {
    const db = new FakeDatabase();
    const repo = new SessionRepository(db);
    const id = await repo.create(1000);
    expect(id).toBe(1);
    expect(db.last?.sql).toContain("INSERT INTO work_sessions");
  });

  it("rounds seconds when saving a summary", async () => {
    const db = new FakeDatabase();
    const repo = new SessionRepository(db);
    await repo.save(
      5,
      {
        sittingSeconds: 12.7,
        standingSeconds: 0,
        awaySeconds: 0,
        unknownSeconds: 0,
        goodPostureSeconds: 3.2,
        poorPostureSeconds: 0,
        postureNotificationCount: 2,
        positionNotificationCount: 1,
      },
      2000,
    );
    const params = db.last?.params ?? [];
    expect(db.last?.sql).toContain("UPDATE work_sessions");
    expect(params).toContain(13); // rounded sitting seconds
    expect(params[params.length - 1]).toBe(5); // id is last param
  });
});

describe("EventRepository", () => {
  it("inserts a position event with the right columns", async () => {
    const db = new FakeDatabase();
    const repo = new EventRepository(db);
    await repo.insertPositionEvent({
      previous: "sitting",
      next: "standing",
      confidence: 0.9,
      source: "automatic",
      atMs: 4242,
    });
    expect(db.last?.sql).toContain("INSERT INTO position_events");
    expect(db.last?.params).toEqual(["sitting", "standing", 0.9, "automatic", 4242]);
  });
});

describe("CalibrationRepository", () => {
  it("replaces then inserts on save, and round-trips baselines on getLatest", async () => {
    const db = new FakeDatabase();
    const repo = new CalibrationRepository(db);
    const positionBaseline = {
      positionType: "sitting" as const,
      features: { shoulderY: 0.6 },
      sampleCount: 20,
      confidence: 0.9,
    };
    await repo.save(
      { positionType: "sitting", postureBaseline: null, positionBaseline },
      1234,
      1,
    );
    // First a DELETE of the same type, then an INSERT.
    expect(db.executed[0]?.sql).toContain("DELETE FROM calibration_profiles");
    expect(db.executed[1]?.sql).toContain("INSERT INTO calibration_profiles");

    // getLatest parses the stored JSON columns back into baselines.
    db.selectRows = [
      {
        id: 1,
        position_type: "sitting",
        camera_device_id: null,
        baseline_features_json: "null",
        feature_variance_json: JSON.stringify(positionBaseline),
        camera_width: 640,
        camera_height: 360,
        confidence: 0.9,
        created_at: 1234,
        updated_at: 1234,
      },
    ];
    const profile = await repo.getLatest("sitting", 1);
    expect(profile?.positionBaseline?.features.shoulderY).toBe(0.6);
    expect(profile?.postureBaseline).toBeNull();
  });
});
