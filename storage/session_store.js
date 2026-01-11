// --- Chapter 1: Session Store ---
// Role: Manage ephemeral session data in chrome.storage.session
// Implements: Tab Graph (Opener linkage) & Temporal Graph (Time-ordered events)

import { getDomain, getETLDPlusOne } from '../utils/domain.js';

const KEY_TAB_GRAPH = 'session:tabGraph';
const KEY_TEMPORAL_GRAPH = 'session:temporalGraph';

const CONFIG = {
  MAX_EVENTS_PER_CONTEXT: 20,
  MAX_CONTEXTS: 200,
  TEMPORAL_TTL_MS: 60000 // 60s
};

// --- Internal Helper: Context ID Logic ---

/**
 * Recursively finds the Root Tab ID (Context ID) by walking up the opener chain.
 * @param {number} tabId 
 * @param {Object} tabGraph 
 * @param {Set<number>} visited - Prevent infinite loops
 * @returns {string} contextId (stringified number)
 */
function resolveContextId(tabId, tabGraph, visited = new Set()) {
  if (visited.has(tabId)) return String(tabId); // Loop detected, break
  visited.add(tabId);

  const node = tabGraph[tabId];
  if (!node || !node.openerTabId) {
    // I am root (or orphan)
    return String(tabId);
  }

  // Recursive step: Go to parent
  return resolveContextId(node.openerTabId, tabGraph, visited);
}

// --- Public API ---

/**
 * Records a parent-child relationship between tabs.
 * @param {number} targetTabId 
 * @param {number} sourceTabId 
 * @param {boolean} overwrite - Whether to overwrite existing opener (default: false)
 */
export async function recordTabOpener(targetTabId, sourceTabId, overwrite = false) {
  const data = await chrome.storage.session.get([KEY_TAB_GRAPH]);
  const graph = data[KEY_TAB_GRAPH] || {};
  const now = Date.now();

  const current = graph[targetTabId];
  
  // Logic: 
  // 1. If new, create.
  // 2. If exists, only overwrite if explicit flag is true (onCreatedNavigationTarget > tabs.onCreated)
  if (!current) {
    graph[targetTabId] = { openerTabId: sourceTabId, createdAt: now, lastSeenAt: now };
  } else {
    if (overwrite || !current.openerTabId) {
      current.openerTabId = sourceTabId;
    }
    current.lastSeenAt = now;
  }

  // Also update source to keep it fresh
  if (graph[sourceTabId]) {
    graph[sourceTabId].lastSeenAt = now;
  } else {
    // Ensure source exists even if we missed its creation
    graph[sourceTabId] = { createdAt: now, lastSeenAt: now };
  }

  await chrome.storage.session.set({ [KEY_TAB_GRAPH]: graph });
}

/**
 * Records a navigation event into the Temporal Graph.
 * Automatically resolves the correct Context ID.
 * @param {Object} params 
 * @param {number} params.tabId
 * @param {string} params.url
 * @param {string} params.kind - EVENT_KINDS value
 */
export async function recordTemporalEvent({ tabId, url, kind }) {
  // 1. Prepare Data
  // Use getDomain to safely parse URL. Avoid direct new URL(url) calls.
  const hostname = getDomain(url);
  if (!hostname) return;

  const domain = getETLDPlusOne(hostname);
  if (!domain) return;
  
  const now = Date.now();

  // 2. Load Graphs
  const data = await chrome.storage.session.get([KEY_TAB_GRAPH, KEY_TEMPORAL_GRAPH]);
  const tabGraph = data[KEY_TAB_GRAPH] || {};
  const tempGraph = data[KEY_TEMPORAL_GRAPH] || {};

  // 3. Resolve Context
  // Ensure current tab exists in graph (for tracking lastSeen)
  if (!tabGraph[tabId]) {
    tabGraph[tabId] = { createdAt: now, lastSeenAt: now };
  } else {
    tabGraph[tabId].lastSeenAt = now;
  }
  
  const contextId = resolveContextId(tabId, tabGraph);
  const openerId = tabGraph[tabId].openerTabId;

  // 4. Update Temporal Graph
  const contextData = tempGraph[contextId] || { events: [], updatedAt: 0 };
  
  // CRITICAL: Explicitly construct object to ensure 'url' is NOT stored.
  // Privacy Constraint: Only eTLD+1 domain is stored.
  const newEvent = {
    ts: now,
    domain: domain,
    tabId: tabId,
    openerTabId: openerId, // Snapshot opener at this moment
    kind: kind
  };

  // Ring Buffer Logic
  let events = [...contextData.events, newEvent];
  if (events.length > CONFIG.MAX_EVENTS_PER_CONTEXT) {
    events = events.slice(events.length - CONFIG.MAX_EVENTS_PER_CONTEXT);
  }

  tempGraph[contextId] = {
    events: events,
    updatedAt: now
  };

  // Capacity Guard (Simple LRU approximation via Object.keys sort could be here, 
  // but handled in GC module for performance)

  // 5. Save All
  await chrome.storage.session.set({
    [KEY_TAB_GRAPH]: tabGraph,
    [KEY_TEMPORAL_GRAPH]: tempGraph
  });
}

/**
 * Retrieves the temporal chain for a specific context.
 * @param {number} tabId 
 */
export async function getSessionContext(tabId) {
  const data = await chrome.storage.session.get([KEY_TAB_GRAPH, KEY_TEMPORAL_GRAPH]);
  const tabGraph = data[KEY_TAB_GRAPH] || {};
  const tempGraph = data[KEY_TEMPORAL_GRAPH] || {};

  const contextId = resolveContextId(tabId, tabGraph);
  return tempGraph[contextId] || null;
}
