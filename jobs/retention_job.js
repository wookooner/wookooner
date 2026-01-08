// --- Chapter 3: Retention Job ---
// Role: Execute cleanup based on policy
// Logic: Check Interval -> Filter Events -> Prune Domains -> Save

import { getRetentionPolicy, setRetentionPolicy, POLICY_KEY } from '../storage/retention_policy.js';
import { DOMAIN_STATE_KEY } from '../storage/domain_state.js';

// Duplicate constant to avoid importing from service_worker (circular dependency risk)
const EVENTS_KEY = 'pdtm_events_v1';
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // Run at most every 6 hours

/**
 * Checks if cleanup is needed and runs it if so.
 * This function is designed to be safe to call frequently (e.g., on navigation).
 * @param {Object} storageAPI - chrome.storage.local or mock
 * @param {boolean} force - Force run regardless of interval
 * @returns {Promise<Object|null>} - Returns stats of cleanup if run, null otherwise
 */
export async function performRetentionCheck(storageAPI, force = false) {
  const policy = await getRetentionPolicy(storageAPI);
  const now = Date.now();

  // 1. Check Interval (Throttle)
  if (!force && (now - policy.last_cleanup_ts < CLEANUP_INTERVAL_MS)) {
    return null; // Too soon
  }

  // 2. Load Data
  // [Architecture Note] Reading all data into memory is fine for Chapter 3.
  // For Chapter 4+ with huge datasets, we will need IndexedDB cursors.
  const data = await storageAPI.get([EVENTS_KEY, DOMAIN_STATE_KEY]);
  let events = data[EVENTS_KEY] || [];
  let domainStates = data[DOMAIN_STATE_KEY] || {};

  const stats = {
    eventsRemoved: 0,
    domainsPruned: 0,
    timestamp: now
  };

  // 3. Cleanup Raw Events (Time-based TTL)
  // Logic: Keep if (now - ts) < (ttl_days * 24h)
  if (policy.raw_events_ttl_days > 0) {
    const cutoff = now - (policy.raw_events_ttl_days * 86400000);
    const initialCount = events.length;
    events = events.filter(e => e.ts >= cutoff);
    stats.eventsRemoved = initialCount - events.length;
  }

  // 4. Prune Inactive Domains (Time-based TTL)
  // Logic: Keep if (now - last_seen) < (ttl_days * 24h)
  if (policy.prune_inactive_domains_days > 0) {
    const cutoff = now - (policy.prune_inactive_domains_days * 86400000);
    const domains = Object.keys(domainStates);
    
    domains.forEach(domain => {
      const state = domainStates[domain];
      if (state.last_seen < cutoff) {
        delete domainStates[domain];
        stats.domainsPruned++;
      }
    });
  }

  // 5. Save & Update Policy Timestamp
  policy.last_cleanup_ts = now;
  
  await storageAPI.set({
    [EVENTS_KEY]: events,
    [DOMAIN_STATE_KEY]: domainStates,
    [POLICY_KEY]: policy
  });

  console.log(`[PDTM] Cleanup Run: Removed ${stats.eventsRemoved} events, Pruned ${stats.domainsPruned} domains.`);
  return stats;
}
