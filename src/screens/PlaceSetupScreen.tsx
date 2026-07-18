/**
 * New-spot setup: name the place, then flow into the guided posture
 * calibration AT that spot. The place is fingerprinted from the current scene
 * so Spine-IQ recognizes it (and swaps to its baselines) automatically from
 * then on.
 */
import { useState } from "react";
import { useAppContext } from "../app/AppProvider";
import { useHistory } from "../app/HistoryProvider";
import { LogoMark } from "../components/Logo";

const NAME_SUGGESTIONS = [
  "Couch",
  "Comfy chair",
  "Office desk",
  "Standing desk",
  "Kitchen table",
] as const;

export function PlaceSetupScreen(): JSX.Element {
  const { state, dispatch } = useAppContext();
  const history = useHistory();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const existing = new Set(state.places.map((p) => p.name.toLowerCase()));
  const suggestions = NAME_SUGGESTIONS.filter(
    (s) => !existing.has(s.toLowerCase()),
  );

  const create = (): void => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    void history.createPlace(trimmed, Date.now()).then((place) => {
      dispatch({
        type: "set_places",
        places: history.placesCache.map((p) => ({ id: p.id, name: p.name })),
      });
      void history.selectPlace(place.id, performance.now()).then(() => {
        dispatch({
          type: "set_active_place",
          place: { id: place.id, name: place.name },
        });
        // Straight into the guided sitting calibration at this spot.
        dispatch({ type: "set_phase", phase: "calibrate" });
      });
    });
  };

  return (
    <section className="screen place-setup">
      <LogoMark size={30} />
      <h1>Looks like a new spot</h1>
      <p>
        This view doesn’t match any place Spine-IQ knows. Name it, then
        calibrate your posture here — from now on it’ll recognize this spot and
        judge you by the right baseline automatically.
      </p>
      <label className="field">
        <span className="field-label">What should we call it?</span>
        <input
          type="text"
          value={name}
          placeholder="e.g. Couch"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {suggestions.length > 0 && (
        <div className="chip-row">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip-option${name === s ? " selected" : ""}`}
              onClick={() => setName(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="pause-controls">
        <button
          className="primary"
          disabled={!name.trim() || creating}
          onClick={create}
        >
          {creating ? "Saving…" : "Save & calibrate here"}
        </button>
        <button
          className="ghost"
          onClick={() => dispatch({ type: "exit_place_setup" })}
        >
          Cancel
        </button>
      </div>
      <p className="hint">
        Only a coarse brightness fingerprint of the background is stored —
        never an image.
      </p>
    </section>
  );
}
