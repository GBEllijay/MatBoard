/**
 * Student screens no longer show a gym logo (owner, Nov 13 2026), so this
 * prompt is not rendered. Coach Sync, inbox, and Import from coach still
 * receive and store a gym-sent logo. Existing stored data is left in place.
 * The library helpers (gymLogoPromptDue, accept, ignore) stay for tests and
 * inbound writers.
 */
export function GymLogoPrompt() {
  return null;
}
