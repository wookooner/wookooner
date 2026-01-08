// --- Chapter 2: Service Worker (Background Script) ---
// Role: Sensor & Storage Coordinator
// Logic: Navigation -> Filter -> Dedupe -> Store Event -> Update Domain State
// Updated for Chapter 3: Triggers Retention Check

import { updateDomainState } from './storage/domain_state.js';
import { performRetentionCheck } from './jobs/retention_job.js';

const SETTINGS_KEY = 'pdtm_settings_v1';
const EVENTS_KEY = 'pdtm_events_v1';
const MAX_EVENTS_DEFAULT = 1000;

// Promise Chain for Serialization (Mutex-like behavior)
// This ensures that concurrent navigation events do not overwrite storage updates.
//
// [Architecture Note]
// Currently, this queue is unbounded. If events trigger faster than storage writes,
// the queue length and memory usage will grow.
// For Chapter 2 scale (personal browsing), this is acceptable.
// Future optimization (Chapter 4+): Implement coalescing (batching last update) or a bounded buffer.
let updateQueue = Promise.resolve();

// 1. Utility: Extract Hostname
const getDomain = (urlStr) => {
  try {
    const url = new URL(urlStr);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.hostname;
  } catch (e) {
    return null;
  }
};

// 2. Init
chrome.runtime.onInstalled.addListener(async () => {
  const settings = await chrome.storage.local.get(SETTINGS_KEY);
  if (!settings[SETTINGS_KEY]) {
    await chrome.storage.local.set({
      [SETTINGS_KEY]: { collectionEnabled: true, maxEvents: MAX_EVENTS_DEFAULT }
    });
  }
});

// 3. Main Event Listener
chrome.webNavigation.onCompleted.addListener((details) => {
  // Enqueue the operation to prevent race conditions
  updateQueue = updateQueue.then(async () => {
    
    // Filter: Main Frame only
    if (details.frameId !== 0) return;

    const domain = getDomain(details.url);
    if (!domain) return;

    // Fetch Data
    const data = await chrome.storage.local.get([EVENTS_KEY, SETTINGS_KEY]);
    const settings = data[SETTINGS_KEY] || { collectionEnabled: true, maxEvents: MAX_EVENTS_DEFAULT };
    
    if (!settings.collectionEnabled) return;

    const events = data[EVENTS_KEY] || [];
    const timestamp = Date.now();

    // Dedupe (Burst Prevention: < 2s)
    if (events.length > 0) {
      const lastEvent = events[0];
      if (lastEvent.domain === domain && (timestamp - lastEvent.ts < 2000)) {
        return; 
      }
    }

    // A. Store Raw Event (Log)
    const newEvent = {
      ts: timestamp,
      domain: domain,
      type: 'page_view'
    };
    const updatedEvents = [newEvent, ...events].slice(0, settings.maxEvents);
    await chrome.storage.local.set({ [EVENTS_KEY]: updatedEvents });
    
    // B. Update Domain State (Aggregation)
    // Critical: This is now serialized via updateQueue
    await updateDomainState(domain, timestamp, chrome.storage.local);
    
    // C. Update Badge (UX Improvement: Show "Today's" count)
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const todayCount = updatedEvents.filter(e => e.ts >= startOfToday).length;
    
    if (todayCount > 0) {
      // Use a shorthand if > 999 (e.g., 1k+)
      const text = todayCount > 999 ? '1k+' : todayCount.toString();
      chrome.action.setBadgeText({ text });
      chrome.action.setBadgeBackgroundColor({ color: '#6366f1' }); 
    } else {
      chrome.action.setBadgeText({ text: '' });
    }

    // D. Chapter 3: Retention Check
    // Opportunistically check if cleanup is needed.
    // We await this to ensure it respects the queue lock (no parallel storage writes).
    // The job itself throttles (checks interval) so it's cheap to call often.
    await performRetentionCheck(chrome.storage.local);

  }).catch(err => {
    console.error("PDTM Service Worker Error:", err);
  });
}, { url: [{ schemes: ['http', 'https'] }] });