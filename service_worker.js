// --- Chapter 1: Service Worker (Background Script) ---
// Role: Sensor & Storage
// Logic: Listen to navigation -> Filter -> Dedupe -> Store in chrome.storage.local

const SETTINGS_KEY = 'pdtm_settings_v1';
const EVENTS_KEY = 'pdtm_events_v1';
const MAX_EVENTS_DEFAULT = 1000;

// 1. Utility: Extract Hostname (Data Minimization)
const getDomain = (urlStr) => {
  try {
    const url = new URL(urlStr);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.hostname;
  } catch (e) {
    return null;
  }
};

// 2. Initialize Default Settings
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
  // Filter: Main Frame only (frameId === 0)
  if (details.frameId !== 0) return;

  const domain = getDomain(details.url);
  if (!domain) return;

  // Fetch current state
  const data = await chrome.storage.local.get([EVENTS_KEY, SETTINGS_KEY]);
  const settings = data[SETTINGS_KEY] || { collectionEnabled: true, maxEvents: MAX_EVENTS_DEFAULT };
  
  if (!settings.collectionEnabled) return;

  const events = data[EVENTS_KEY] || [];
  const timestamp = Date.now();

  // Dedupe: Prevent storing same domain if visited within last 2 seconds
  // (Simple burst prevention)
  if (events.length > 0) {
    const lastEvent = events[0]; // Assuming [0] is most recent
    if (lastEvent.domain === domain && (timestamp - lastEvent.ts < 2000)) {
      return; // Ignore duplicate
    }
  }

  // Create Event
  const newEvent = {
    ts: timestamp,
    domain: domain,
    type: 'page_view'
  };

  // Update Storage (Prepend new event)
  const updatedEvents = [newEvent, ...events].slice(0, settings.maxEvents);
  
  await chrome.storage.local.set({ [EVENTS_KEY]: updatedEvents });
  
  // Optional: Update Badge (Simple numeric indicator)
  if (updatedEvents.length > 0) {
    chrome.action.setBadgeText({ text: updatedEvents.length.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' }); // Indigo
  } else {
     chrome.action.setBadgeText({ text: '' });
  }

}, { url: [{ schemes: ['http', 'https'] }] }); // Filter at API level