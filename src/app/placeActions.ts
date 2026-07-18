/**
 * Shared place-switching flow, used by both automatic scene detection (the
 * monitoring hook) and manual selection (dashboard). Switching a place swaps
 * in that place's calibrations so posture is judged against the right baseline
 * — couch slouch vs. couch baseline, not desk baseline.
 */
import type { Dispatch } from "react";
import type { HistoryStore } from "../storage/historyStore";
import type { AppAction } from "./appState";

export async function applyPlaceSwitch(
  history: HistoryStore,
  dispatch: Dispatch<AppAction>,
  placeId: number,
  nowMs: number,
  opts: { updateDescriptor?: boolean } = {},
): Promise<void> {
  await history.selectPlace(placeId, nowMs, opts);
  const place = history.placesCache.find((p) => p.id === placeId);
  if (place) {
    dispatch({
      type: "set_active_place",
      place: { id: place.id, name: place.name },
    });
  }
  const { sitting, standing } = await history.loadCalibrations();
  // Swap baselines when this place has them; otherwise keep the current ones
  // (better than none) until the user calibrates here.
  if (sitting?.postureBaseline) {
    dispatch({ type: "set_baseline", baseline: sitting.postureBaseline });
  }
  if (sitting?.positionBaseline) {
    dispatch({ type: "set_position_baseline", baseline: sitting.positionBaseline });
  }
  if (standing?.positionBaseline) {
    dispatch({ type: "set_position_baseline", baseline: standing.positionBaseline });
  }
}
