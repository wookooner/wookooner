// --- Chapter 5: Settings Repository ---
// Role: Manage User Preferences including Privacy Mode
// SSOT for configuration.

export const SETTINGS_KEY = 'pdtm_settings_v1';

export const PRIVACY_MODES = Object.freeze({
  STRICT: 'STRICT_PRIVACY',      // No values, no full URLs, basic existence checks only
  IMPROVED: 'IMPROVED_ACCURACY'  // Allows structural hashes and non-sensitive metadata
});

export const DEFAULT_SETTINGS = {
  collectionEnabled: true,
  maxEvents: 1000,
  softThreshold: 25,
  privacyMode: PRIVACY_MODES.STRICT
};

/**
 * Retrieves the current settings.
 * @param {Object} storageAPI 
 */
export async function getSettings(storageAPI) {
  const data = await storageAPI.get([SETTINGS_KEY]);
  return { ...DEFAULT_SETTINGS, ...data[SETTINGS_KEY] };
}

/**
 * Updates settings partially.
 * @param {Object} patch 
 * @param {Object} storageAPI 
 */
export async function updateSettings(patch, storageAPI) {
  const current = await getSettings(storageAPI);
  const updated = { ...current, ...patch };
  await storageAPI.set({ [SETTINGS_KEY]: updated });
  return updated;
}
