// --- Chapter 0: Temporal Roundtrip ---
// Role: Define "Roundtrip" precisely to avoid ambiguity.

/**
 * Checks if a sequence of events constitutes a valid Roundtrip.
 * Definition:
 * 1. Events in same context (same tabId OR linked opener)
 * 2. Ordered: RP -> IdP (Forward) -> ... -> IdP -> RP (Backward)
 * 3. Within TTL
 * 
 * @param {Object} params
 * @param {string} params.rpCandidate - Domain of RP
 * @param {string} params.idpCandidate - Domain of IdP
 * @param {Array} params.events - List of event objects { ts, domain, tabId?, openerTabId? }
 * @param {number} [params.ttlMs] - Time To Live (default 30s)
 * @returns {boolean}
 */
export function isRoundtrip({ rpCandidate, idpCandidate, events, ttlMs = 30000 }) {
  if (!events || events.length < 2) return false;

  // Ensure strict time ordering
  const sortedEvents = [...events].sort((a, b) => a.ts - b.ts);

  // 1. Find the "Forward" leg: Navigation TO IdP
  // Refined Rule: The event immediately preceding IdP must be RP.
  // This prevents false positives where we just happen to see IdP later in a session.
  const forwardIndex = sortedEvents.findIndex((e, idx) => 
    e.domain === idpCandidate && 
    idx > 0 && 
    sortedEvents[idx - 1].domain === rpCandidate
  );

  if (forwardIndex === -1) return false;
  
  const forwardEvent = sortedEvents[forwardIndex];

  // 2. Find the "Backward" leg: Navigation BACK to RP
  // Must occur AFTER the forward event
  const backwardIndex = sortedEvents.findIndex((e, idx) => {
    return idx > forwardIndex && e.domain === rpCandidate;
  });

  if (backwardIndex === -1) return false;

  const backwardEvent = sortedEvents[backwardIndex];

  // 3. Check TTL
  if (backwardEvent.ts - forwardEvent.ts > ttlMs) return false;

  // 4. Check Context (Tab Linkage)
  // If tabIds are available, they must match OR be opener-linked.
  // If tabIds are missing (e.g. legacy data), we skip strict check (or fail, depending on policy).
  // Per Chapter 0 Strict Rules: "Events must belong to the same tab context".
  // We assume strictness if data is present.
  if (forwardEvent.tabId && backwardEvent.tabId) {
    const t1 = forwardEvent.tabId;
    const t2 = backwardEvent.tabId;

    if (t1 !== t2) {
      // Allowed only if explicitly linked via opener
      // Check if backward event (t2) was opened by forward event tab (t1) or vice versa
      const linked = (backwardEvent.openerTabId === t1) || (forwardEvent.openerTabId === t2);
      if (!linked) return false;
    }
  }

  return true;
}
