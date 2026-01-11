// --- Chapter 1: Domain Utilities ---
// Role: Extract and normalize domain names for privacy-safe storage.

/**
 * Extracts the hostname from a URL string safely.
 * @param {string} urlStr 
 * @returns {string|null}
 */
export function getDomain(urlStr) {
  try {
    if (!urlStr) return null;
    const url = new URL(urlStr);
    // Strict protocol check to avoid garbage (e.g. 'about:blank', 'chrome://')
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.hostname;
  } catch (e) {
    return null;
  }
}

/**
 * Heuristic to estimate eTLD+1 (Effective Top Level Domain + 1).
 * [MVP Decision]
 * Currently, this does NOT implement a full Public Suffix List (PSL).
 * It strictly performs "Hostname Normalization" by stripping common subdomains (www, m).
 * 
 * Limitation: 'accounts.google.com' will remain 'accounts.google.com' instead of 'google.com'.
 * This is acceptable for Chapter 1 as it preserves privacy (no path/query) and allows basic correlation.
 * 
 * @param {string} hostname 
 * @returns {string}
 */
export function getETLDPlusOne(hostname) {
  if (!hostname) return '';
  
  // 1. Remove common noise subdomains
  let clean = hostname.toLowerCase();
  
  const parts = clean.split('.');
  
  // If IP address, return as is
  if (parts.every(p => !isNaN(parseInt(p)))) return clean;

  if (parts.length > 2) {
    if (parts[0] === 'www' || parts[0] === 'm' || parts[0] === 'mobile') {
      return parts.slice(1).join('.');
    }
  }
  
  return clean;
}
