// --- Chapter 3: Retention Policy Repository ---
// Role: Define rules for data expiration (TTL)
// "Automated Management"

export const POLICY_KEY = 'pdtm_retention_policy_v1';

export const DEFAULT_POLICY = {
  raw_events_ttl_days: 30,           // Keep raw logs for 30 days
  prune_inactive_domains_days: 180,  // Forget domain if not visited in 180 days
  last_cleanup_ts: 0                 // Timestamp of last cleanup run
};

/**
 * @typedef {Object} RetentionPolicy
 * @property {number} raw_events_ttl_days
 * @property {number} prune_inactive_domains_days
 * @property {number} last_cleanup_ts
 */

/**
 * Get current policy or defaults
 * @param {Object} storageAPI 
 * @returns {Promise<RetentionPolicy>}
 */
export async function getRetentionPolicy(storageAPI) {
  const data = await storageAPI.get([POLICY_KEY]);
  return { ...DEFAULT_POLICY, ...data[POLICY_KEY] };
}

/**
 * Save policy
 * @param {RetentionPolicy} policy 
 * @param {Object} storageAPI 
 */
export async function setRetentionPolicy(policy, storageAPI) {
  await storageAPI.set({ [POLICY_KEY]: policy });
}
