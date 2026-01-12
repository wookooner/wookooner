// --- Chapter 4: Explanation Generator ---
// Role: Generate user-facing text explaining *why* a domain was classified.
// Privacy: Uses only evidence flags and normalized domains. No PII.

import { EVIDENCE_TYPES } from '../signals/evidence_types.js';

const FLAG_DESCRIPTIONS = {
  [EVIDENCE_TYPES.REDIRECT_URI_MATCH]: "Redirect flow matched linked service",
  [EVIDENCE_TYPES.STRONG_PATH]: "URL path indicates authentication",
  [EVIDENCE_TYPES.KNOWN_IDP]: "Known Identity Provider",
  [EVIDENCE_TYPES.OAUTH_PARAMS]: "OAuth protocol parameters detected",
  [EVIDENCE_TYPES.OPENER_LINK]: "Opened by another tab (popup flow)",
  [EVIDENCE_TYPES.TEMPORAL_CHAIN]: "Roundtrip authentication flow detected",
  [EVIDENCE_TYPES.SAML_FORM]: "SAML 2.0 Single Sign-On form detected" // Chapter 5
};

/**
 * Builds a short explanation string.
 * @param {Object} params
 * @param {string[]} params.evidenceFlags
 * @param {string} [params.rp_domain]
 * @param {string} [params.idp_domain]
 * @returns {string}
 */
export function buildExplanation({ evidenceFlags, rp_domain, idp_domain }) {
  if (!evidenceFlags || evidenceFlags.length === 0) {
    return "Passive browsing activity";
  }

  // Priority: structural -> behavioral -> static
  let primaryReason = "";

  if (evidenceFlags.includes(EVIDENCE_TYPES.SAML_FORM)) {
    primaryReason = "SAML SSO form detected (Structure only)";
  } else if (evidenceFlags.includes(EVIDENCE_TYPES.REDIRECT_URI_MATCH)) {
    primaryReason = rp_domain 
      ? `Login flow for ${rp_domain}` 
      : "Standard OAuth redirect detected";
  } else if (evidenceFlags.includes(EVIDENCE_TYPES.TEMPORAL_CHAIN)) {
    primaryReason = "Completed login sequence detected";
  } else if (evidenceFlags.includes(EVIDENCE_TYPES.OPENER_LINK)) {
    primaryReason = "Popup login window detected";
  } else if (evidenceFlags.includes(EVIDENCE_TYPES.STRONG_PATH) || evidenceFlags.includes(EVIDENCE_TYPES.OAUTH_PARAMS)) {
    primaryReason = "Authentication page structure";
  } else if (evidenceFlags.includes(EVIDENCE_TYPES.KNOWN_IDP)) {
    primaryReason = "Identity Provider domain";
  } else {
    primaryReason = "Account activity detected";
  }

  return primaryReason;
}
