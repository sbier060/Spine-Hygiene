import { describe, it, expect } from "vitest";
import {
  canNotify,
  postureNotification,
  sittingNotification,
} from "../src/notifications/interventionRules";
import type { NotificationGate } from "../src/notifications/notificationTypes";
import { NotificationService, type Notifier } from "../src/notifications/notificationService";
import type { NotificationContent } from "../src/notifications/notificationTypes";

const OPEN_GATE: NotificationGate = {
  paused: false,
  away: false,
  onboarding: false,
  screenLocked: false,
  inCooldown: false,
};

describe("canNotify", () => {
  it("allows notifications when nothing blocks", () => {
    expect(canNotify(OPEN_GATE)).toBe(true);
  });

  it("blocks when paused, away, onboarding, locked, or in cooldown", () => {
    expect(canNotify({ ...OPEN_GATE, paused: true })).toBe(false);
    expect(canNotify({ ...OPEN_GATE, away: true })).toBe(false);
    expect(canNotify({ ...OPEN_GATE, onboarding: true })).toBe(false);
    expect(canNotify({ ...OPEN_GATE, screenLocked: true })).toBe(false);
    expect(canNotify({ ...OPEN_GATE, inCooldown: true })).toBe(false);
  });
});

describe("message builders", () => {
  it("rotates posture messages and avoids medical language", () => {
    const a = postureNotification(0).body;
    const b = postureNotification(1).body;
    expect(a).not.toBe(b);
    expect(postureNotification(4).body).toBe(a); // wraps
    for (const bad of ["spinal", "diagnosis", "damage", "disc"]) {
      expect(a.toLowerCase()).not.toContain(bad);
    }
  });

  it("includes the duration in a sitting reminder", () => {
    expect(sittingNotification(50).body).toContain("50 minutes");
  });
});

describe("NotificationService", () => {
  it("does not deliver when the gate blocks it", async () => {
    const sent: NotificationContent[] = [];
    const notifier: Notifier = {
      ensurePermission: () => Promise.resolve(true),
      send: (c) => {
        sent.push(c);
        return Promise.resolve();
      },
    };
    const svc = new NotificationService(notifier);
    const result = await svc.notify(postureNotification(0), {
      ...OPEN_GATE,
      paused: true,
    });
    expect(result.sent).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("delivers when allowed and permission is granted", async () => {
    const sent: NotificationContent[] = [];
    const notifier: Notifier = {
      ensurePermission: () => Promise.resolve(true),
      send: (c) => {
        sent.push(c);
        return Promise.resolve();
      },
    };
    const svc = new NotificationService(notifier);
    const result = await svc.notify(postureNotification(0), OPEN_GATE);
    expect(result.sent).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it("reports a typed error when permission is denied", async () => {
    const notifier: Notifier = {
      ensurePermission: () => Promise.resolve(false),
      send: () => Promise.resolve(),
    };
    const svc = new NotificationService(notifier);
    const result = await svc.notify(postureNotification(0), OPEN_GATE);
    expect(result.sent).toBe(false);
    expect(result.error?.type).toBe("notification_permission_denied");
  });
});
