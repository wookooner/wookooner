// --- Chapter 2: URL Path Utility ---
// Role: Normalize paths for matching rules

import { OAUTH_STRONG_PATHS } from '../signals/oauth_constants.js';

/**
 * Normalizes URL path (lowercase, remove trailing slash)
 * @param {string} urlStr 
 * @returns {string}
 */
export function getNormalizedPath(urlStr) {
  try {
    const url = new URL(urlStr);
    let path = url.pathname.toLowerCase();
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return path;
  } catch (e) {
    return '';
  }
}

/**
 * Checks if the URL path matches any known Strong Auth Paths.
 * @param {string} urlStr 
 * @returns {boolean}
 */
export function isStrongAuthPath(urlStr) {
  const path = getNormalizedPath(urlStr);
  if (!path) return false;

  // Exact match check against Set
  if (OAUTH_STRONG_PATHS.has(path)) return true;

  // Suffix/Prefix check for specific known patterns (optional extension)
  // For MVP, strict set matching + specific common suffixes
  if (path.endsWith('/authorize') || path.endsWith('/login/oauth/authorize')) {
    return true;
  }

  return false;
}
