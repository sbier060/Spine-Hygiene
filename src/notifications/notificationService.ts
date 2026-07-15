/**
 * Notification service. Applies the intervention guard, then delegates delivery
 * to a `Notifier` (dependency-injected so the guard logic is testable without
 * Tauri). The default `TauriNotifier` uses the Tauri notification plugin.
 */
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type {
  NotificationContent,
  NotificationGate,
} from "./notificationTypes";
import { canNotify } from "./interventionRules";
import { spineError, type SpineIqError } from "../utils/errors";

/** Delivery backend. */
export interface Notifier {
  ensurePermission(): Promise<boolean>;
  send(content: NotificationContent): Promise<void>;
}

/** Real backend backed by the Tauri notification plugin (runs on device). */
export class TauriNotifier implements Notifier {
  async ensurePermission(): Promise<boolean> {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    return granted;
  }

  async send(content: NotificationContent): Promise<void> {
    sendNotification({ title: content.title, body: content.body });
    return Promise.resolve();
  }
}

export class NotificationService {
  private permissionOk = false;

  constructor(private readonly notifier: Notifier = new TauriNotifier()) {}

  /** Request OS notification permission once (call during onboarding). */
  async ensurePermission(): Promise<boolean> {
    this.permissionOk = await this.notifier.ensurePermission();
    return this.permissionOk;
  }

  /**
   * Show a notification if the gate allows it. Returns whether it was sent.
   * Never throws for a blocked notification; surfaces a typed error only on a
   * genuine delivery failure.
   */
  async notify(
    content: NotificationContent,
    gate: NotificationGate,
  ): Promise<{ sent: boolean; error?: SpineIqError }> {
    if (!canNotify(gate)) return { sent: false };
    try {
      if (!this.permissionOk) {
        this.permissionOk = await this.notifier.ensurePermission();
      }
      if (!this.permissionOk) {
        return {
          sent: false,
          error: spineError(
            "notification_permission_denied",
            "Notification permission has not been granted.",
          ),
        };
      }
      await this.notifier.send(content);
      return { sent: true };
    } catch (err) {
      return {
        sent: false,
        error: spineError(
          "notification_permission_denied",
          err instanceof Error ? err.message : "Failed to send notification.",
        ),
      };
    }
  }
}
