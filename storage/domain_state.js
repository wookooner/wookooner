// --- Chapter 2: Domain State Repository ---
// Role: Aggregation Logic & Schema Definition
// Single Source of Truth for Domain Stats

export const DOMAIN_STATE_KEY = 'pdtm_domain_state_v1';

/**
 * @typedef {Object} DomainState
 * @property {string} domain - Primary Key
 * @property {number} first_seen - Timestamp (ms)
 * @property {number} last_seen - Timestamp (ms)
 * @property {number} visit_count_total - Total visits
 */

/**
 * Updates or creates a domain state record.
 * @param {string} domain 
 * @param {number} timestamp 
 * @param {Object} storageAPI - Abstracted storage interface (has .get and .set)
 */
export async function updateDomainState(domain, timestamp, storageAPI) {
  // 1. Fetch entire state map (Simple for Chapter 2 scale)
  const data = await storageAPI.get([DOMAIN_STATE_KEY]);
  const stateMap = data[DOMAIN_STATE_KEY] || {};

  // 2. Find or Init
  const record = stateMap[domain] || {
    domain: domain,
    first_seen: timestamp,
    last_seen: 0,
    visit_count_total: 0
  };

  // 3. Update Logic
  record.last_seen = timestamp;
  record.visit_count_total += 1;

  // 4. Save back
  stateMap[domain] = record;
  await storageAPI.set({ [DOMAIN_STATE_KEY]: stateMap });
}