// --- UI View Models ---
// Role: Transform raw storage data into UI-ready lists
// Logic: Hard/Soft separation, sorting rules

import { ActivityLevels } from '../signals/activity_levels.js';

/**
 * Priorities for Hard List sorting
 */
const LEVEL_PRIORITY = {
  [ActivityLevels.TRANSACTION]: 3,
  [ActivityLevels.UGC]: 2,
  [ActivityLevels.ACCOUNT]: 1,
  [ActivityLevels.VIEW]: 0
};

/**
 * Builds the "Needs Management" (Hard) List
 * Rule: Activity Level in {ACCOUNT, UGC, TRANSACTION}
 * Sort: Level Priority > Risk Score > Last Seen
 */
export function buildHardList(domainStates, activityStates, riskStates, overrides) {
  return Object.keys(activityStates)
    .filter(domain => {
      const level = activityStates[domain]?.last_estimation_level;
      const isIgnored = overrides[domain]?.ignored;
      // Filter logic
      return !isIgnored && 
             level && 
             level !== ActivityLevels.VIEW;
    })
    .map(domain => {
      const activity = activityStates[domain];
      const risk = riskStates[domain] || { score: 0 };
      const override = overrides[domain] || {};
      
      return {
        domain,
        level: activity.last_estimation_level,
        score: risk.score,
        last_seen: activity.last_estimation_ts,
        reasons: risk.reasons || [],
        pinned: !!override.pinned,
        whitelisted: !!override.whitelisted,
        category: override.category,
        count_map: activity.counts_by_level
      };
    })
    .sort((a, b) => {
      // 1. Level Priority
      const prioDiff = LEVEL_PRIORITY[b.level] - LEVEL_PRIORITY[a.level];
      if (prioDiff !== 0) return prioDiff;
      
      // 2. Risk Score
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      
      // 3. Recency
      return b.last_seen - a.last_seen;
    });
}

/**
 * Builds the "Review" (Soft) List
 * Rule: Activity Level == VIEW AND (Score >= Threshold OR High Freq)
 * Note: High frequency is usually baked into the score, so we rely on Score.
 */
export function buildSoftList(domainStates, activityStates, riskStates, overrides, threshold = 25) {
  return Object.keys(activityStates)
    .filter(domain => {
      const level = activityStates[domain]?.last_estimation_level;
      const risk = riskStates[domain] || { score: 0 };
      const isIgnored = overrides[domain]?.ignored;
      
      // Filter logic
      return !isIgnored &&
             level === ActivityLevels.VIEW &&
             risk.score >= threshold;
    })
    .map(domain => {
      const activity = activityStates[domain];
      const risk = riskStates[domain] || { score: 0 };
      const override = overrides[domain] || {};

      return {
        domain,
        level: ActivityLevels.VIEW,
        score: risk.score,
        last_seen: activity.last_estimation_ts,
        reasons: risk.reasons || [],
        pinned: !!override.pinned,
        whitelisted: !!override.whitelisted,
        category: override.category
      };
    })
    .sort((a, b) => {
      // 1. Risk Score
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      
      // 2. Recency
      return b.last_seen - a.last_seen;
    });
}

/**
 * Builds the Overview Stats
 */
export function buildOverviewStats(events, hardList, softList, policy) {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const todayCount = events.filter(e => e.ts >= startOfToday).length;

  return {
    todayCount,
    hardCount: hardList.length,
    softCount: softList.length,
    lastCleanup: policy.last_cleanup_ts
  };
}

/**
 * Checks if a domain is in the Hard list (to show "Managed" badge in Recent)
 */
export function isManagedDomain(domain, activityStates) {
  const level = activityStates[domain]?.last_estimation_level;
  return level && level !== ActivityLevels.VIEW;
}
