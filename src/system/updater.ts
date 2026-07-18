/**
 * Self-update. Checks the GitHub Releases feed (signed with Spine-IQ's own
 * updater key — independent of Apple), installs silently, and relaunches.
 * Users install once; every release after that reaches them automatically.
 */

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let updating = false;

export async function checkForUpdates(): Promise<void> {
  if (!import.meta.env.PROD || !isTauri() || updating) return;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return;
    updating = true;
    console.log(`Spine-IQ: installing update ${update.version}`);
    await update.downloadAndInstall();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (err) {
    // Offline or rate-limited — try again on the next interval.
    console.error("Spine-IQ: update check failed", err);
    updating = false;
  }
}
