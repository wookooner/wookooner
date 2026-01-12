// --- Chapter 2: Service Worker (Background Script) ---
// Role: Sensor & Storage Coordinator
// Logic: Navigation -> Filter -> Dedupe -> Store Event -> Update Domain State
// Updated for Chapter 3: Triggers Retention Check & RP/IdP Inference
// Updated for Chapter 4: Activity Classification (Navigation + DOM Signals)
// Updated for Chapter 5: Risk Calculation, User Overrides & SAML Support
// Updated for Chapter 6: Centralized Defaults & RESET_ALL Handler
// Updated for Chapter 1: Session Graph Infrastructure

import { updateDomainState } from './storage/domain_state.js';
import { performRetentionCheck } from './jobs/retention_job.js';
import { classify } from './jobs/classifier_job.js';
import { updateActivityState } from './storage/activity_state.js';
import { updateRiskForDomain } from './jobs/risk_job.js'; 
import { updateUserOverride } from './storage/user_overrides.js'; 
import { getSettings, PRIVACY_MODES } from './storage/settings.js'; // Chapter 5
import { KEYS, DEFAULTS } from './storage/defaults.js';
import { getDomain } from './utils/domain.js';
import { SIGNAL_CODES } from './signals/signal_codes.js';

// Chapter 1 Imports
import { recordTabOpener, recordTemporalEvent } from './storage/session_store.js';
import { startupCleanupSessionStore, handleTabRemoval, pruneExpiredSessionData } from './storage/session_gc.js';
import { EVENT_KINDS } from './signals/event_sources.js';

// Promise Chain for Serialization (Mutex-like behavior)
let updateQueue = Promise.resolve();

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
  
  // Chapter 1: Session GC on Install/Update
  await startupCleanupSessionStore();
});

// Chapter 1: Session GC on Startup
chrome.runtime.onStartup.addListener(() => {
  startupCleanupSessionStore();
});

// Chapter 1: Tab Removal Tracking
chrome.tabs.onRemoved.addListener((tabId) => {
  // Ensure we handle errors and serialized cleanup where possible
  handleTabRemoval(tabId).catch(err => console.error("[PDTM] Tab Removal Error:", err));
});

// Chapter 1: Opener Detection (High Reliability)
chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
  // details.sourceTabId is the opener
  if (details.sourceTabId && details.tabId) {
    // Fix: Serialize via updateQueue to prevent race conditions with recordTemporalEvent
    updateQueue = updateQueue.then(async () => {
      await recordTabOpener(details.tabId, details.sourceTabId, true);
    }).catch(err => console.error("[PDTM] onCreatedNavTarget Error:", err));
  }
});

// 3. Main Event Listener (Navigation)
chrome.webNavigation.onCompleted.addListener((details) => {
  updateQueue = updateQueue.then(async () => {
    
    // Filter: Main Frame only
    if (details.frameId !== 0) return;

    // Chapter 1: Record Session Event (Serialized in Queue)
    if (details.url) {
      await recordTemporalEvent({
        tabId: details.tabId,
        url: details.url,
        kind: EVENT_KINDS.COMPLETED
      });
      
      // Chapter 1: Opportunistic GC (Probabilistic, e.g., 10%)
      // Keeps session store clean during active usage
      if (Math.random() < 0.1) {
        await pruneExpiredSessionData();
      }
    }

    const domain = getDomain(details.url);
    if (!domain) return;

    // Fetch Data
    const data = await chrome.storage.local.get([KEYS.EVENTS, KEYS.SETTINGS, KEYS.DOMAIN_STATE, KEYS.USER_OVERRIDES]);
    const settings = data[KEYS.SETTINGS] || DEFAULTS.SETTINGS;
    
    if (!settings.collectionEnabled) return;

    const events = data[KEYS.EVENTS] || [];
    const domainStates = data[KEYS.DOMAIN_STATE] || {};
    const overrides = data[KEYS.USER_OVERRIDES] || {};
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
    // We do this first so we have accurate counts for the classifier
    await updateDomainState(domain, timestamp, chrome.storage.local);
    
    // Refresh local count from the update we just did (or previous value + 1)
    const currentVisitCount = (domainStates[domain]?.visit_count_total || 0) + 1;
    const isPinned = !!overrides[domain]?.pinned;

    // C. Chapter 4/3: Activity Classification (URL-based + Context)
    // Updated: Pass tabId for RP Inference AND visitCount for Risk Logic
    const estimation = await classify(details.url, [], { 
      tabId: details.tabId,
      visitCount: currentVisitCount,
      isPinned: isPinned
    }); 
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

// Chapter 1: Additional Navigation Events for Session Graph
// Fix: Added Serialization via updateQueue to prevent race conditions

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  
  updateQueue = updateQueue.then(async () => {
    await recordTemporalEvent({
      tabId: details.tabId,
      url: details.url,
      kind: EVENT_KINDS.COMMITTED
    });
  }).catch(err => console.error("[PDTM] onCommitted Error:", err));
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0) return;

  updateQueue = updateQueue.then(async () => {
    await recordTemporalEvent({
      tabId: details.tabId,
      url: details.url,
      kind: EVENT_KINDS.HISTORY
    });
  }).catch(err => console.error("[PDTM] onHistory Error:", err));
});

// 4. Message Listener (UI & Content Scripts)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // A. RESET_ALL (Chapter 6: Factory Reset)
  if (message.type === 'RESET_ALL') {
    updateQueue = updateQueue.then(async () => {
      await chrome.storage.local.clear();
      await chrome.storage.session.clear();
      await chrome.storage.local.set({
        [KEYS.SETTINGS]: DEFAULTS.SETTINGS,
        [KEYS.POLICY]: DEFAULTS.POLICY,
        [KEYS.EVENTS]: DEFAULTS.EVENTS,
        [KEYS.DOMAIN_STATE]: DEFAULTS.DOMAIN_STATE,
        [KEYS.ACTIVITY_STATE]: DEFAULTS.ACTIVITY_STATE,
        [KEYS.RISK_STATE]: DEFAULTS.RISK_STATE,
        [KEYS.USER_OVERRIDES]: DEFAULTS.USER_OVERRIDES
      });
      await chrome.action.setBadgeText({ text: '' });
      return true;
    }).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      console.error("Reset Error:", err);
      sendResponse({ success: false, error: err.message });
    });
    return true; 
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
  // Handles generic DOM signals (password, editor)
  if (message.type === 'ACTIVITY_SIGNAL') {
    if (!sender.tab || !sender.tab.url) return;
    const domain = getDomain(sender.tab.url);
    if (!domain) return;

    updateQueue = updateQueue.then(async () => {
      const settings = await getSettings(chrome.storage.local);
      if (!settings.collectionEnabled) return;

      const { payload } = message; 
      const estimation = await classify(payload.url, payload.signals, { tabId: sender.tab.id });
      await updateActivityState(domain, estimation, payload.timestamp, chrome.storage.local);
      await updateRiskForDomain(domain, chrome.storage.local);
      console.log(`[PDTM] DOM Signal processed for ${domain}:`, estimation.level);
    }).catch(err => console.error("Signal Processing Error:", err));
  }

  // D. Chapter 5: SAML Form Signal (Content Script)
  if (message.type === 'SAML_FORM_SIGNAL') {
    if (!sender.tab || !sender.tab.url) return;
    const domain = getDomain(sender.tab.url);
    if (!domain) return;

    updateQueue = updateQueue.then(async () => {
      const settings = await getSettings(chrome.storage.local);
      if (!settings.collectionEnabled) return;

      const { payload } = message; // { hasSamlForm, actionDomain, actionPathHash... }
      
      // Privacy Mode Filtering
      // If Strict, strip metadata before processing (though logic mostly relies on boolean presence)
      if (settings.privacyMode === PRIVACY_MODES.STRICT) {
         delete payload.actionDomain;
         delete payload.actionPathHash;
      }

      // Convert to classification signal
      const explicitSignals = [SIGNAL_CODES.DOM_SAML];
      
      const estimation = await classify(sender.tab.url, explicitSignals, { 
        tabId: sender.tab.id,
        samlContext: payload // Pass metadata to classifier if needed for future logic
      });

      await updateActivityState(domain, estimation, message.timestamp || Date.now(), chrome.storage.local);
      await updateRiskForDomain(domain, chrome.storage.local);
      console.log(`[PDTM] SAML Signal processed for ${domain}`);

    }).catch(err => console.error("SAML Processing Error:", err));
  }

  // E. Chapter 5: User Override (UI)
  if (message.type === 'SET_OVERRIDE') {
    const { domain, overrides } = message.payload; 
    updateQueue = updateQueue.then(async () => {
       await updateUserOverride(domain, overrides, chrome.storage.local);
       await updateRiskForDomain(domain, chrome.storage.local);
       return true;
    }).then(() => {
       sendResponse({ success: true });
    }).catch(err => {
       sendResponse({ success: false, error: err.message });
    });
    return true; 
  }
});
