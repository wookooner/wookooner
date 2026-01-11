// --- Chapter 1: Domain Utilities ---
// Role: Extract and normalize domain names for privacy-safe storage.

/**
 * Extracts the hostname from a URL string.
 * @param {string} urlStr 
 * @returns {string|null}
 */
export function getDomain(urlStr) {
  try {
    if (!urlStr) return null;
    const url = new URL(urlStr);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.hostname;
  } catch (e) {
    return null;
  }
}

/**
 * Heuristic to estimate eTLD+1 (Effective Top Level Domain + 1).
 * For MVP, we strip common subdomains like 'www', 'm', 'api'.
 * A full Public Suffix List implementation is too heavy for this stage.
 * @param {string} hostname 
 * @returns {string}
 */
export function getETLDPlusOne(hostname) {
  if (!hostname) return '';
  
  // 1. Remove common noise subdomains
  let clean = hostname.toLowerCase();
  
  // Very basic heuristic for standardizing accumulation
  // (e.g. www.google.com -> google.com)
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
