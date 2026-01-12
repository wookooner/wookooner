// --- Chapter 0: Evidence Types ---
// Role: Vocabulary for Auth Flow Confidence
// Immutable Contract

export const EVIDENCE_TYPES = Object.freeze({
  REDIRECT_URI_MATCH: 'redirect_uri_match', // Strong: redirect_uri matches Opener/Context
  STRONG_PATH: 'strong_path',               // Strong: Known auth paths like /authorize
  KNOWN_IDP: 'known_idp',                   // Strong: Domain matches known Identity Provider allowlist
  SAML_FORM: 'saml_form',                   // Strong: SAML 2.0 Form structure detected (Ch5)
  OAUTH_PARAMS: 'oauth_params',             // Strong: Presence of standard OAuth 2.0/OIDC query parameters
  OPENER_LINK: 'opener_link',               // Strong: window.opener relationship verified
  TEMPORAL_CHAIN: 'temporal_chain',         // Strong: heuristics based on timing sequence
  TRANSITION_QUALIFIERS: 'transition_qualifiers' // Aux: Generic heuristics (e.g. "login" keyword)
});
