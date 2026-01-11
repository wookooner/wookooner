// --- Chapter 2: Service Worker (Background Script) ---
// Role: Sensor & Storage Coordinator
// Logic: Navigation -> Filter -> Dedupe -> Store Event -> Update Domain State
// Updated for Chapter 3: Triggers Retention Check
// Updated for Chapter 4: Activity Classification (Navigation + DOM Signals)
// Updated for Chapter 5: Risk Calculation & User Overrides
// Updated for Chapter 6: Centralized Defaults & RESET_ALL Handler

import { updateDomainState } from './storage/domain_state.js';
import { performRetentionCheck } from './jobs/retention_job.js';
import { classify } from './jobs/classifier_job.js';
import { updateActivityState } from './storage/activity_state.js';
import { updateRiskForDomain } from './jobs/risk_job.js'; 
import { updateUserOverride } from './storage/user_overrides.js'; 
import { KEYS, DEFAULTS } from './storage/defaults.js';

// Promise Chain for Serialization (Mutex-like behavior)
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
  // Check all keys defined in DEFAULTS to ensure complete initialization
  const keysToCheck = Object.values(KEYS);
  const data = await chrome.storage.local.get(keysToCheck);
  
  const missing = {};
  let hasMissing = false;

  // Iterate over key names (EVENTS, SETTINGS, etc.)
  for (const keyName of Object.keys(KEYS)) {
    const storageKey = KEYS[keyName];
    // If key is completely missing from storage
    if (data[storageKey] === undefined) {
      const defaultValue = DEFAULTS[keyName];
      // If we have a default value for this key
      if (defaultValue !== undefined) {
         missing[storageKey] = defaultValue;
         hasMissing = true;
      }
    }
  }

  if (hasMissing) {
    await chrome.storage.local.set(missing);
    console.log("[PDTM] Initialized missing storage keys:", Object.keys(missing));
  }
});

// 3. Main Event Listener (Navigation)
chrome.webNavigation.onCompleted.addListener((details) => {
  updateQueue = updateQueue.then(async () => {
    
    // Filter: Main Frame only
    if (details.frameId !== 0) return;

    const domain = getDomain(details.url);
    if (!domain) return;

    // Fetch Data
    const data = await chrome.storage.local.get([KEYS.EVENTS, KEYS.SETTINGS]);
    const settings = data[KEYS.SETTINGS] || DEFAULTS.SETTINGS;
    
    if (!settings.collectionEnabled) return;

    const events = data[KEYS.EVENTS] || [];
    const timestamp = Date.now();

    // Dedupe (Burst Prevention: < 2s)
    if (events.length > 0) {
      const lastEvent = events[0];
      if (lastEvent.domain === domain && (timestamp - lastEvent.ts < 2000)) {
        return; 
      }
    }

    // A. Store Raw Event
    const newEvent = {
      ts: timestamp,
      domain: domain,
      type: 'page_view'
    };
    const updatedEvents = [newEvent, ...events].slice(0, settings.maxEvents);
    await chrome.storage.local.set({ [KEYS.EVENTS]: updatedEvents });
    
    // B. Update Domain State (Basic Stats)
    await updateDomainState(domain, timestamp, chrome.storage.local);

    // C. Chapter 4: Activity Classification (URL-based)
    const estimation = classify(details.url, []); // No explicit signals yet
    await updateActivityState(domain, estimation, timestamp, chrome.storage.local);

    // D. Chapter 5: Risk Calculation
    // Must run AFTER activity/domain state updates
    await updateRiskForDomain(domain, chrome.storage.local);
    
    // E. Update Badge
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const todayCount = updatedEvents.filter(e => e.ts >= startOfToday).length;
    
    if (todayCount > 0) {
      const text = todayCount > 999 ? '1k+' : todayCount.toString();
      chrome.action.setBadgeText({ text });
      chrome.action.setBadgeBackgroundColor({ color: '#6366f1' }); 
    } else {
      chrome.action.setBadgeText({ text: '' });
    }

    // F. Retention Check
    await performRetentionCheck(chrome.storage.local);

  }).catch(err => {
    console.error("PDTM Service Worker Error:", err);
  });
}, { url: [{ schemes: ['http', 'https'] }] });

// 4. Message Listener (UI & Content Scripts)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // A. RESET_ALL (Chapter 6: Factory Reset)
  // Strictly serialized via updateQueue to prevent race conditions during reset
  if (message.type === 'RESET_ALL') {
    updateQueue = updateQueue.then(async () => {
      // 1. Wipe Storage
      await chrome.storage.local.clear();

      // 2. Restore Defaults (SSOT from defaults.js)
      await chrome.storage.local.set({
        [KEYS.SETTINGS]: DEFAULTS.SETTINGS,
        [KEYS.POLICY]: DEFAULTS.POLICY,
        [KEYS.EVENTS]: DEFAULTS.EVENTS,
        [KEYS.DOMAIN_STATE]: DEFAULTS.DOMAIN_STATE,
        [KEYS.ACTIVITY_STATE]: DEFAULTS.ACTIVITY_STATE,
        [KEYS.RISK_STATE]: DEFAULTS.RISK_STATE,
        [KEYS.USER_OVERRIDES]: DEFAULTS.USER_OVERRIDES
      });

      // 3. Clear Badge
      await chrome.action.setBadgeText({ text: '' });

      return true;
    }).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      console.error("Reset Error:", err);
      sendResponse({ success: false, error: err.message });
    });
    return true; // Keep channel open
  }

  // B. Manual Cleanup (UI)
  if (message.type === 'RUN_CLEANUP') {
    updateQueue = updateQueue.then(async () => {
      const stats = await performRetentionCheck(chrome.storage.local, message.force);
      return stats;
    }).then((stats) => {
      sendResponse({ success: true, stats });
    }).catch((err) => {
      console.error("Manual Cleanup Error:", err);
      sendResponse({ success: false, error: err.message });
    });
    return true; 
  }

  // C. Activity Signal (Content Script)
  if (message.type === 'ACTIVITY_SIGNAL') {
    // Only accept from trusted content scripts (sender.tab must exist)
    if (!sender.tab || !sender.tab.url) return;

    const domain = getDomain(sender.tab.url);
    if (!domain) return;

    updateQueue = updateQueue.then(async () => {
      // Check Collection Enabled Guard
      const data = await chrome.storage.local.get(KEYS.SETTINGS);
      const settings = data[KEYS.SETTINGS] || DEFAULTS.SETTINGS;
      if (!settings.collectionEnabled) return;

      const { payload } = message; // { url, signals, timestamp }
      
      // Re-classify using the DOM signals
      const estimation = classify(payload.url, payload.signals);
      
      // Update Activity State
      await updateActivityState(domain, estimation, payload.timestamp, chrome.storage.local);

      // Chapter 5: Re-calculate Risk based on new signals
      await updateRiskForDomain(domain, chrome.storage.local);

      console.log(`[PDTM] DOM Signal processed for ${domain}:`, estimation.level);

    }).catch(err => {
      console.error("Signal Processing Error:", err);
    });
  }

  // D. Chapter 5: User Override (UI)
  if (message.type === 'SET_OVERRIDE') {
    const { domain, overrides } = message.payload; // overrides = { pinned: true, etc. }
    
    updateQueue = updateQueue.then(async () => {
       // 1. Update the override store
       await updateUserOverride(domain, overrides, chrome.storage.local);
       
       // 2. Re-calculate Risk for this domain immediately
       await updateRiskForDomain(domain, chrome.storage.local);

       return true;
    }).then(() => {
       sendResponse({ success: true });
    }).catch(err => {
       sendResponse({ success: false, error: err.message });
    });
    return true; // Keep channel open
  }
});