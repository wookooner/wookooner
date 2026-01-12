// --- Storage Defaults & Keys ---
// Role: Single Source of Truth for storage keys and default values.
// Used by Service Worker (for Init/Reset) and UI (for Types/Keys).

import { DOMAIN_STATE_KEY } from './domain_state.js';
import { ACTIVITY_STATE_KEY } from './activity_state.js';
import { RISK_STATE_KEY } from './risk_state.js';
import { USER_OVERRIDES_KEY } from './user_overrides.js';
import { POLICY_KEY, DEFAULT_POLICY } from './retention_policy.js';
import { SETTINGS_KEY, DEFAULT_SETTINGS } from './settings.js';

export const KEYS = Object.freeze({
  EVENTS: 'pdtm_events_v1',
  SETTINGS: SETTINGS_KEY,
  DOMAIN_STATE: DOMAIN_STATE_KEY,
  ACTIVITY_STATE: ACTIVITY_STATE_KEY,
  RISK_STATE: RISK_STATE_KEY,
  USER_OVERRIDES: USER_OVERRIDES_KEY,
  POLICY: POLICY_KEY
});

export const DEFAULTS = Object.freeze({
  SETTINGS: DEFAULT_SETTINGS,
  // Ensure we start with a clean slate for retention policy
  POLICY: { 
    ...DEFAULT_POLICY, 
    last_cleanup_ts: 0 
  },
  EVENTS: [],
  DOMAIN_STATE: {},
  ACTIVITY_STATE: {},
  RISK_STATE: {},
  USER_OVERRIDES: {}
});
