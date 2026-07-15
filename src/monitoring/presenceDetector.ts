/**
 * Presence debouncing. A person must be detected on several consecutive frames
 * before we consider them "present" and resume posture classification (spec:
 * "require several valid detections before resuming"). Presence is dropped
 * immediately on a miss; the away *grace period* is handled by the state machine
 * so a single dropped frame never flips us to away.
 */
export class PresenceDetector {
  private streak = 0;
  private present = false;

  constructor(private readonly requiredConsecutive = 3) {}

  /** Feed whether a person was detected this frame; returns debounced presence. */
  update(personDetected: boolean): boolean {
    if (personDetected) {
      this.streak += 1;
      if (this.streak >= this.requiredConsecutive) this.present = true;
    } else {
      this.streak = 0;
      this.present = false;
    }
    return this.present;
  }

  get isPresent(): boolean {
    return this.present;
  }

  reset(): void {
    this.streak = 0;
    this.present = false;
  }
}

/** Whether a landmark list represents a detectable person (has a shoulder or face point). */
export function personDetectedFrom(landmarkCount: number): boolean {
  return landmarkCount > 0;
}
