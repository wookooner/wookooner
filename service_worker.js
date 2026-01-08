// --- Chapter 2: Service Worker (Background Script) ---
// Role: Sensor & Storage Coordinator
// Logic: Navigation -> Filter -> Dedupe -> Store Event -> Update Domain State

import { updateDomainState } from './storage/domain_state.js';

const SETTINGS_KEY = 'pdtm_settings_v1';
const EVENTS_KEY = 'pdtm_events_v1';
const MAX_EVENTS_DEFAULT = 1000;

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
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const domain = getDomain(details.url);
  if (!domain) return;

  const data = await chrome.storage.local.get([EVENTS_KEY, SETTINGS_KEY]);
  const settings = data[SETTINGS_KEY] || { collectionEnabled: true, maxEvents: MAX_EVENTS_DEFAULT };
  
  if (!settings.collectionEnabled) return;

  const events = data[EVENTS_KEY] || [];
  const timestamp = Date.now();

  // Dedupe (Burst Prevention)
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
  // Chapter 2: Updating the long-term stats immediately
  await updateDomainState(domain, timestamp, chrome.storage.local);
  
  // Update Badge
  if (updatedEvents.length > 0) {
    chrome.action.setBadgeText({ text: updatedEvents.length.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' }); 
  }

}, { url: [{ schemes: ['http', 'https'] }] });