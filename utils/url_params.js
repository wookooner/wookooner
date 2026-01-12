// --- Chapter 2: URL Parameter Utility ---
// Role: Extract metadata from Query String without touching values.
// Privacy Guard: NEVER return parameter values.

/**
 * Extracts unique parameter keys from a URL.
 * Guaranteed to never return values.
 * @param {string} urlStr 
 * @returns {Set<string>} Set of parameter keys
 */
export function getParamKeys(urlStr) {
  const keys = new Set();
  try {
    const url = new URL(urlStr);
    // Iterator provides [key, value], we only take key.
    for (const key of url.searchParams.keys()) {
      keys.add(key);
    }
  } catch (e) {
    // Fail safe: return empty set
  }
  return keys;
}
