// --- Chapter 4: Activity State Repository ---
// Role: SSOT for Activity Classification Aggregates
// Stores "What kind of actions" happen on a domain.

import { ActivityLevels } from '../signals/activity_levels.js';

export const ACTIVITY_STATE_KEY = 'pdtm_activity_state_v1';

/**
 * @typedef {Object} DomainActivityState
 * @property {string} domain
 * @property {string} last_estimation_level - ActivityLevel enum value
 * @property {number} last_estimation_ts
 * @property {Object.<string, number>} counts_by_level - { view: 10, account: 2 ... }
 * @property {number} [last_account_touch_ts]
 * @property {number} [last_transaction_signal_ts]
 */

/**
 * Updates the activity state for a domain based on a new estimation.
 * Handles "Upgrade" logic to prevent double-counting for the same visit.
 * @param {string} domain 
 * @param {Object} estimation - { level, confidence, reasons }
 * @param {number} timestamp 
 * @param {Object} storageAPI 
 */
export async function updateActivityState(domain, estimation, timestamp, storageAPI) {
  const data = await storageAPI.get([ACTIVITY_STATE_KEY]);
  const stateMap = data[ACTIVITY_STATE_KEY] || {};

  const record = stateMap[domain] || {
    domain: domain,
    last_estimation_level: ActivityLevels.VIEW,
    last_estimation_ts: 0,
    counts_by_level: {
      [ActivityLevels.VIEW]: 0,
      [ActivityLevels.ACCOUNT]: 0,
      [ActivityLevels.UGC]: 0,
      [ActivityLevels.TRANSACTION]: 0
    }
  };

  // P0-3: Double Counting Prevention
  // If this update is very close to the last one (e.g., < 10 seconds), 
  // treat it as a "refinement" of the current visit rather than a new one.
  const isReclassification = (timestamp - record.last_estimation_ts < 10000);

  // [Architecture Note]
  // Strategy: "Highest Level per Visit"
  // When re-classifying (upgrading) a visit within the time window, we decrement the old level count
  // and increment the new one.
  // Example: View (passive) -> Account (login). 
  // Result: 0 Views, 1 Account visit.
  // Rationale: We want to track the "nature" of the visit, not every micro-step.
  // This avoids inflating the total visit count. For funnel analysis, a different data model would be needed.

  if (isReclassification) {
    // Check if level changed (Upgrade/Change)
    if (record.last_estimation_level !== estimation.level) {
      // Decrement old bucket (if exists and > 0)
      if (record.counts_by_level[record.last_estimation_level] > 0) {
        record.counts_by_level[record.last_estimation_level]--;
      }
      // Increment new bucket
      if (!record.counts_by_level[estimation.level]) {
        record.counts_by_level[estimation.level] = 0;
      }
      record.counts_by_level[estimation.level]++;
    }
    // If level is same, do nothing to counts (just update timestamp/metadata below)
  } else {
    // New Visit
    if (!record.counts_by_level[estimation.level]) {
      record.counts_by_level[estimation.level] = 0;
    }
    record.counts_by_level[estimation.level]++;
  }

  // 2. Update Metadata
  record.last_estimation_level = estimation.level;
  record.last_estimation_ts = timestamp;

  // 3. Track specific critical timestamps
  if (estimation.level === ActivityLevels.ACCOUNT) {
    record.last_account_touch_ts = timestamp;
  } else if (estimation.level === ActivityLevels.TRANSACTION) {
    record.last_transaction_signal_ts = timestamp;
  }

  // 4. Save
  stateMap[domain] = record;
  await storageAPI.set({ [ACTIVITY_STATE_KEY]: stateMap });
}
