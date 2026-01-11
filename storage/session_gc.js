// --- Chapter 1: Session GC ---
// Role: Cleanup ephemeral session data (TTL, Capacity, Orphans)

const KEY_TAB_GRAPH = 'session:tabGraph';
const KEY_TEMPORAL_GRAPH = 'session:temporalGraph';

const TTL_MS = 60000; // 60 seconds
const MAX_CONTEXTS = 200;

/**
 * Runs on Service Worker startup to clean stale data.
 */
export async function startupCleanupSessionStore() {
  const data = await chrome.storage.session.get([KEY_TAB_GRAPH, KEY_TEMPORAL_GRAPH]);
  let tabGraph = data[KEY_TAB_GRAPH] || {};
  let tempGraph = data[KEY_TEMPORAL_GRAPH] || {};
  
  const now = Date.now();
  let changed = false;

  // 1. Clean Temporal Graph by TTL
  const contextIds = Object.keys(tempGraph);
  contextIds.forEach(ctxId => {
    const entry = tempGraph[ctxId];
    if (now - entry.updatedAt > TTL_MS) {
      delete tempGraph[ctxId];
      changed = true;
    }
  });

  // 2. Capacity Guard (Contexts)
  const remainingIds = Object.keys(tempGraph);
  if (remainingIds.length > MAX_CONTEXTS) {
    // Sort by updatedAt ASC (oldest first)
    remainingIds.sort((a, b) => tempGraph[a].updatedAt - tempGraph[b].updatedAt);
    const toRemove = remainingIds.slice(0, remainingIds.length - MAX_CONTEXTS);
    toRemove.forEach(id => delete tempGraph[id]);
    changed = true;
  }

  // 3. Clean Tab Graph (Stale tabs > 1 hour, probably dead)
  // tabGraph is less sensitive but shouldn't grow forever.
  const TAB_TTL = 3600000; // 1 hour
  Object.keys(tabGraph).forEach(tid => {
    if (now - tabGraph[tid].lastSeenAt > TAB_TTL) {
      delete tabGraph[tid];
      changed = true;
    }
  });

  if (changed) {
    await chrome.storage.session.set({
      [KEY_TAB_GRAPH]: tabGraph,
      [KEY_TEMPORAL_GRAPH]: tempGraph
    });
    console.log("[PDTM Session] Startup Cleanup Completed.");
  }
}

/**
 * Handles tab removal event.
 * Removes tab from graph and optionally cleans up empty contexts.
 * @param {number} tabId 
 */
export async function handleTabRemoval(tabId) {
  const data = await chrome.storage.session.get([KEY_TAB_GRAPH, KEY_TEMPORAL_GRAPH]);
  let tabGraph = data[KEY_TAB_GRAPH] || {};
  let tempGraph = data[KEY_TEMPORAL_GRAPH] || {};

  // 1. Remove from Tab Graph
  if (tabGraph[tabId]) {
    delete tabGraph[tabId];
    // Note: We do NOT delete the node if it's a parent to others? 
    // For MVP, we delete. Children will become orphans (new roots), which is acceptable 
    // as the flow is likely broken or finished.
  }

  // 2. Remove related events from Temporal Graph?
  // Actually, we might want to KEEP the events for a bit (TTL) even if tab closes,
  // because OAuth often closes the popup (tab) immediately after redirect.
  // Therefore, we do NOT aggressively delete from temporalGraph here.
  // We strictly rely on TTL in `startupCleanup` or `performRetentionCheck` equivalents.
  
  await chrome.storage.session.set({ [KEY_TAB_GRAPH]: tabGraph });
}
