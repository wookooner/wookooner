// --- Chapter 2: OAuth/OIDC Constants ---
// Role: SSOT for Auth Detection Rules
// Privacy: Only keys and paths, no user data.

export const OAUTH_CORE_KEYS = new Set([
  'client_id',
  'redirect_uri',
  'response_type',
  'scope',
  'state',
  'nonce',
  'code_challenge',
  'code_challenge_method',
  'id_token_hint',
  'ui_locales'
]);

export const OAUTH_STRONG_PATHS = new Set([
  '/authorize',
  '/oauth/authorize',
  '/oauth2/authorize',
  '/oauth2/v2.0/authorize',
  '/v1/authorize',
  '/consent',
  '/u/login',
  '/signin-oidc',
  '/.well-known/openid-configuration'
]);

export const KNOWN_IDP_PATTERNS = [
  /^accounts\.google\.com$/,
  /^login\.microsoftonline\.com$/,
  /^appleid\.apple\.com$/,
  /^auth0\.com$/,
  /^okta\.com$/,
  /^id\.twitch\.tv$/,
  /^github\.com\/login\/oauth/ // Special case: path included in pattern
];

// Keywords that are considered WEAK/NEUTRAL without other evidence
// Used to prevent false positives (e.g. /author, /authority)
export const WEAK_AUTH_KEYWORDS = ['auth', 'login', 'signin', 'signup'];
