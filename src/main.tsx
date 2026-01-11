import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Shield, 
  Activity, 
  Trash2, 
  Pause, 
  Play, 
  Clock, 
  LayoutDashboard,
  Globe, 
  Settings as SettingsIcon,
  Eraser,
  Eye,
  User,
  PenTool,
  CreditCard,
  AlertTriangle,
  Pin,
  CheckCircle,
  EyeOff,
  Tag,
  ListFilter,
  Inbox,
  Briefcase,
  Undo2
} from 'lucide-react';
import { ActivityLevels } from '../signals/activity_levels.js';
import { UI_CONSTANTS } from '../ui/constants.js';
import { buildHardList, buildSoftList, buildOverviewStats, isManagedDomain } from '../ui/view_models.js';
import { KEYS, DEFAULTS } from '../storage/defaults.js';

// Declare chrome to avoid TS errors
declare const chrome: any;

// --- Types (UI Only) ---
interface RawEvent {
  ts: number;
  domain: string;
  type: 'page_view';
}

interface AppSettings {
  collectionEnabled: boolean;
  maxEvents: number;
  softThreshold?: number; // Added for Chapter 6
}

// --- API ---
const isExtensionEnv = typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;

const api = {
  get: (keys: string[]) => {
    if (isExtensionEnv) {
      return chrome.storage.local.get(keys);
    } else {
      return new Promise((resolve) => {
        const result: any = {};
        keys.forEach(k => {
          const item = localStorage.getItem(k);
          if (item) result[k] = JSON.parse(item);
        });
        resolve(result);
      });
    }
  },
  set: (items: Record<string, any>) => {
    if (isExtensionEnv) {
      return chrome.storage.local.set(items);
    } else {
      return new Promise<void>((resolve) => {
        Object.entries(items).forEach(([k, v]) => {
          localStorage.setItem(k, JSON.stringify(v));
        });
        window.dispatchEvent(new Event('storage')); 
        resolve();
      });
    }
  }
};

// --- Helpers ---
const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const formatRelative = (ts: number) => {
  if (!ts) return 'Never';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString();
};

const getActivityIcon = (level: string) => {
  switch (level) {
    case ActivityLevels.TRANSACTION: return <CreditCard size={14} className="text-rose-500" />;
    case ActivityLevels.UGC: return <PenTool size={14} className="text-purple-500" />;
    case ActivityLevels.ACCOUNT: return <User size={14} className="text-blue-500" />;
    default: return <Eye size={14} className="text-slate-400" />;
  }
};

const CATEGORY_OPTIONS = [
  { value: 'finance', label: 'Finance' },
  { value: 'auth', label: 'Auth' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'social', label: 'Social' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'other', label: 'Other' },
];

// --- Main Component ---
const Popup = () => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(UI_CONSTANTS.TABS.OVERVIEW);
  
  // Data State
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [activityStates, setActivityStates] = useState<Record<string, any>>({});
  const [riskStates, setRiskStates] = useState<Record<string, any>>({});
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [settings, setSettings] = useState<AppSettings>({ collectionEnabled: true, maxEvents: 1000, softThreshold: UI_CONSTANTS.SOFT_THRESHOLD_DEFAULT });
  const [policy, setPolicy] = useState<any>({});
  // Reserved for future use (stats aggregation)
  const [domainStates, setDomainStates] = useState<Record<string, any>>({});

  const loadData = async () => {
    // Dynamically fetch all keys defined in the SSOT
    const keysToFetch = Object.values(KEYS);
    const data = await api.get(keysToFetch);
    
    setEvents(data[KEYS.EVENTS] || []);
    // P0-2: Functional update to prevent stale closures, safely merging with defaults/previous
    setSettings(prev => ({ ...prev, ...(data[KEYS.SETTINGS] || {}) }));
    
    setDomainStates(data[KEYS.DOMAIN_STATE] || {});
    setActivityStates(data[KEYS.ACTIVITY_STATE] || {});
    setRiskStates(data[KEYS.RISK_STATE] || {});
    setOverrides(data[KEYS.USER_OVERRIDES] || {});
    setPolicy(data[KEYS.POLICY] || {});
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    if (isExtensionEnv) {
      const listener = (_: any, area: string) => { if (area === 'local') loadData(); };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    } else {
      const listener = () => loadData();
      window.addEventListener('storage', listener);
      return () => window.removeEventListener('storage', listener);
    }
  }, []);

  // View Models
  const hardList = useMemo(() => buildHardList(domainStates, activityStates, riskStates, overrides), [domainStates, activityStates, riskStates, overrides]);
  const softList = useMemo(() => buildSoftList(domainStates, activityStates, riskStates, overrides, settings.softThreshold || UI_CONSTANTS.SOFT_THRESHOLD_DEFAULT), [domainStates, activityStates, riskStates, overrides, settings.softThreshold]);
  const overviewStats = useMemo(() => buildOverviewStats(events, hardList, softList, policy), [events, hardList, softList, policy]);
  
  // P1-1: Sort by latest first (descending timestamp) before slicing
  const recentList = useMemo(() => {
    return [...events].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 30);
  }, [events]);

  // Handlers
  
  // P0-2: Stale closure safe update
  const togglePause = async () => {
    setSettings(prev => {
      const newSettings = { ...prev, collectionEnabled: !prev.collectionEnabled };
      // Fire and forget storage update, relying on listener or subsequent loads for sync
      api.set({ [KEYS.SETTINGS]: newSettings });
      return newSettings;
    });
  };

  const updateOverride = async (domain: string, partial: any) => {
    if (isExtensionEnv) {
      await chrome.runtime.sendMessage({ type: 'SET_OVERRIDE', payload: { domain, overrides: partial } });
    } else {
      // Mock for dev
      const current = overrides[domain] || {};
      const updated = { ...overrides, [domain]: { ...current, ...partial } };
      await api.set({ [KEYS.USER_OVERRIDES]: updated });
      loadData();
    }
  };

  const runCleanup = async () => {
    if (isExtensionEnv) await chrome.runtime.sendMessage({ type: 'RUN_CLEANUP', force: true });
  };

  // P0-1: Full Factory Reset (Clears ALL state via Service Worker SSOT)
  const resetAll = async () => {
    if (confirm("Factory Reset: Clear all history, settings, and learned rules? This cannot be undone.")) {
        if (isExtensionEnv) {
            try {
                // Request Reset from Service Worker (SSOT)
                const res = await chrome.runtime.sendMessage({ type: 'RESET_ALL' });
                if (res && res.success) {
                    await loadData();
                    setActiveTab(UI_CONSTANTS.TABS.OVERVIEW);
                } else {
                    alert("Reset failed: " + (res?.error || "Unknown error"));
                }
            } catch (e) {
                console.error("Reset Message Failed:", e);
                alert("Could not communicate with background service.");
            }
        } else {
            // Preview Mode: Manual Reset using SSOT DEFAULTS
            localStorage.clear();
            const defaults = {
                [KEYS.EVENTS]: DEFAULTS.EVENTS, 
                [KEYS.DOMAIN_STATE]: DEFAULTS.DOMAIN_STATE, 
                [KEYS.ACTIVITY_STATE]: DEFAULTS.ACTIVITY_STATE, 
                [KEYS.RISK_STATE]: DEFAULTS.RISK_STATE,
                [KEYS.USER_OVERRIDES]: DEFAULTS.USER_OVERRIDES,
                [KEYS.POLICY]: DEFAULTS.POLICY, // Already has last_cleanup_ts: 0
                [KEYS.SETTINGS]: { 
                  ...DEFAULTS.SETTINGS, 
                  softThreshold: UI_CONSTANTS.SOFT_THRESHOLD_DEFAULT 
                }
            };
            await api.set(defaults);
            await loadData();
            setActiveTab(UI_CONSTANTS.TABS.OVERVIEW);
        }
    }
  };

  // P1-2: Ignored List Helper
  const ignoredList = useMemo(() => {
    return Object.keys(overrides)
      .filter(d => overrides[d].ignored)
      .map(d => ({ domain: d, ...overrides[d] }));
  }, [overrides]);

  if (loading) return <div className="h-full flex items-center justify-center text-slate-400">Loading...</div>;

  return (
    <div className="flex flex-col h-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      
      {/* Top Navigation */}
      <div className="bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
           <div className="flex items-center gap-2">
             <Shield size={16} className="text-indigo-600" />
             <span className="font-bold text-sm text-slate-800">PDTM</span>
           </div>
           <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${settings.collectionEnabled ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
             <div className={`w-1.5 h-1.5 rounded-full ${settings.collectionEnabled ? 'bg-indigo-500 animate-pulse' : 'bg-amber-500'}`} />
             {settings.collectionEnabled ? 'ON' : 'PAUSED'}
           </div>
        </div>
        
        <div className="flex justify-around">
          {[
            { id: UI_CONSTANTS.TABS.OVERVIEW, icon: LayoutDashboard, label: 'Home' },
            { id: UI_CONSTANTS.TABS.RECENT, icon: Clock, label: 'Recent' },
            { id: UI_CONSTANTS.TABS.HARD, icon: Briefcase, label: 'Managed', badge: hardList.length },
            { id: UI_CONSTANTS.TABS.SOFT, icon: Inbox, label: 'Review', badge: softList.length },
            { id: UI_CONSTANTS.TABS.SETTINGS, icon: SettingsIcon, label: 'Config' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 py-2 flex flex-col items-center gap-0.5 transition-colors
                ${activeTab === tab.id ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}
              `}
            >
              <div className="relative">
                <tab.icon size={18} />
                {tab.badge ? (
                  <span className="absolute -top-1.5 -right-2 bg-rose-500 text-white text-[8px] font-bold px-1 rounded-full min-w-[12px] h-[12px] flex items-center justify-center">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                ) : null}
              </div>
              <span className="text-[9px] font-medium">{tab.label}</span>
              {activeTab === tab.id && <div className="absolute bottom-0 w-full h-0.5 bg-indigo-600" />}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        
        {/* --- OVERVIEW --- */}
        {activeTab === UI_CONSTANTS.TABS.OVERVIEW && (
          <div className="p-4 space-y-4">
            {/* Status Card */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
               <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Today's Activity</h2>
               <div className="grid grid-cols-2 gap-4">
                 <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-100">
                    <div className="text-2xl font-bold text-indigo-700">{overviewStats.todayCount}</div>
                    <div className="text-[10px] text-indigo-400 font-medium">Events Captured</div>
                 </div>
                 <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <div className="text-2xl font-bold text-slate-700">{formatRelative(overviewStats.lastCleanup)}</div>
                    <div className="text-[10px] text-slate-400 font-medium">Last Cleanup</div>
                 </div>
               </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
               <button 
                 onClick={() => setActiveTab(UI_CONSTANTS.TABS.HARD)}
                 className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex items-center gap-3 hover:bg-slate-50 transition-colors"
               >
                 <div className="bg-rose-100 p-2 rounded-full text-rose-600"><Briefcase size={18}/></div>
                 <div className="text-left">
                   <div className="text-lg font-bold text-slate-800">{overviewStats.hardCount}</div>
                   <div className="text-[10px] text-slate-500 font-medium">Managed</div>
                 </div>
               </button>
               <button 
                 onClick={() => setActiveTab(UI_CONSTANTS.TABS.SOFT)}
                 className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex items-center gap-3 hover:bg-slate-50 transition-colors"
               >
                 <div className="bg-amber-100 p-2 rounded-full text-amber-600"><Inbox size={18}/></div>
                 <div className="text-left">
                   <div className="text-lg font-bold text-slate-800">{overviewStats.softCount}</div>
                   <div className="text-[10px] text-slate-500 font-medium">Review</div>
                 </div>
               </button>
            </div>
            
            <div className="text-center text-[10px] text-slate-400 mt-4">
              Local-first Digital Footprint Manager v0.6
            </div>
          </div>
        )}

        {/* --- RECENT --- */}
        {activeTab === UI_CONSTANTS.TABS.RECENT && (
          <div>
            {recentList.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                 <Clock size={32} className="opacity-20 mb-2"/>
                 <p className="text-xs">No history yet.</p>
               </div>
            ) : (
              <ul className="divide-y divide-slate-100 bg-white">
                {recentList.map((e, i) => {
                  const isManaged = isManagedDomain(e.domain, activityStates);
                  return (
                    <li key={`${e.ts}-${i}`} className="px-4 py-3 hover:bg-slate-50 flex items-center justify-between group">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="bg-slate-100 p-2 rounded-full text-slate-500">
                          <Globe size={14} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate flex items-center gap-2">
                            {e.domain}
                            {isManaged && (
                               <button 
                                 onClick={(evt) => { evt.stopPropagation(); setActiveTab(UI_CONSTANTS.TABS.HARD); }}
                                 className="px-1.5 py-0.5 bg-rose-50 text-rose-600 text-[9px] font-bold rounded uppercase tracking-wider border border-rose-100 hover:bg-rose-100"
                               >
                                 Managed
                               </button>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">{formatTime(e.ts)}</div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* --- MANAGED (HARD) --- */}
        {activeTab === UI_CONSTANTS.TABS.HARD && (
          <div>
            <div className="px-4 py-2 bg-rose-50 border-b border-rose-100 text-rose-800 text-[10px] font-medium flex items-center gap-2">
              <Briefcase size={12}/>
              Domains with Account, UGC, or Payment activity.
            </div>
            {hardList.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-12 text-slate-400 px-6 text-center">
                 <Briefcase size={32} className="opacity-20 mb-2"/>
                 <p className="text-sm font-medium text-slate-600">No managed domains yet.</p>
                 <p className="text-xs mt-1">Logins, content creation, and payments will appear here automatically.</p>
               </div>
            ) : (
               <ul className="divide-y divide-slate-100 bg-white pb-20">
                 {hardList.map(item => (
                   <li key={item.domain} className="p-4 hover:bg-slate-50 transition-colors">
                     <div className="flex items-start gap-3">
                       {/* Icon Badge */}
                       <div className={`shrink-0 p-2 rounded-lg border ${item.level === ActivityLevels.TRANSACTION ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                          {getActivityIcon(item.level)}
                       </div>
                       
                       <div className="flex-1 min-w-0">
                         <div className="flex justify-between items-start">
                            <div>
                               <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                                 {item.domain}
                                 {item.pinned && <Pin size={10} className="fill-indigo-500 text-indigo-500"/>}
                               </div>
                               <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                                 <span className="capitalize font-medium">{item.level}</span>
                                 <span>•</span>
                                 <span>{formatRelative(item.last_seen)}</span>
                               </div>
                            </div>
                            <div className="flex gap-1">
                               <button onClick={() => updateOverride(item.domain, { pinned: !item.pinned })} className={`p-1.5 rounded hover:bg-slate-200 ${item.pinned ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}>
                                 <Pin size={14} />
                               </button>
                               {/* P1-3: Whitelist Tooltip */}
                               <button 
                                  onClick={() => updateOverride(item.domain, { whitelisted: !item.whitelisted })} 
                                  className={`p-1.5 rounded hover:bg-slate-200 ${item.whitelisted ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400'}`}
                                  title="Mark as Safe: Reduces attention score but keeps in Managed list."
                               >
                                 <CheckCircle size={14} />
                               </button>
                            </div>
                         </div>
                         
                         {/* Category & Tags */}
                         <div className="mt-2 flex items-center gap-2">
                            <div className="relative">
                               <select 
                                 className="appearance-none bg-slate-100 border-none rounded text-[10px] py-1 pl-2 pr-6 font-medium text-slate-600 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                 value={item.category || ''}
                                 onChange={(e) => updateOverride(item.domain, { category: e.target.value })}
                               >
                                 <option value="">+ Tag</option>
                                 {CATEGORY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                               </select>
                               <Tag size={10} className="absolute right-2 top-1.5 text-slate-400 pointer-events-none"/>
                            </div>
                            
                            {/* Simple Score Badge for Hard List (Secondary) */}
                            {item.score > 0 && (
                               <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">
                                 Risk: {item.score}
                               </span>
                            )}
                         </div>
                       </div>
                     </div>
                   </li>
                 ))}
               </ul>
            )}
          </div>
        )}

        {/* --- REVIEW (SOFT) --- */}
        {activeTab === UI_CONSTANTS.TABS.SOFT && (
          <div>
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-800 text-[10px] font-medium flex items-center gap-2">
               <Inbox size={12}/>
               Passive visits with high frequency or attention score {'>'}= {settings.softThreshold || UI_CONSTANTS.SOFT_THRESHOLD_DEFAULT}.
            </div>
            {softList.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-12 text-slate-400 px-6 text-center">
                 <Inbox size={32} className="opacity-20 mb-2"/>
                 <p className="text-sm font-medium text-slate-600">Nothing to review.</p>
                 <p className="text-xs mt-1">Items appear here when you visit them often.</p>
               </div>
            ) : (
               <ul className="divide-y divide-slate-100 bg-white pb-20">
                  {softList.map(item => (
                    <li key={item.domain} className="p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start gap-3">
                        {/* Score Circle */}
                        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border 
                           ${item.score >= 50 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                           {item.score}
                        </div>

                        <div className="flex-1 min-w-0">
                           <div className="flex justify-between items-start">
                              <div>
                                 <div className="font-bold text-slate-800 text-sm truncate">{item.domain}</div>
                                 <div className="text-[10px] text-slate-400 mt-0.5">{formatRelative(item.last_seen)}</div>
                              </div>
                              <div className="flex gap-1">
                                 <button onClick={() => updateOverride(item.domain, { ignored: true })} className="p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-red-500" title="Ignore">
                                   <EyeOff size={14}/>
                                 </button>
                              </div>
                           </div>

                           {/* Reasons */}
                           <div className="mt-2 flex flex-wrap gap-1">
                              {item.reasons.slice(0, 3).map((r: string) => (
                                <span key={r} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200">
                                  {r.replace('level_', '').replace('cat_', '').replace(/_/g, ' ')}
                                </span>
                              ))}
                           </div>
                        </div>
                      </div>
                    </li>
                  ))}
               </ul>
            )}
          </div>
        )}

        {/* --- SETTINGS --- */}
        {activeTab === UI_CONSTANTS.TABS.SETTINGS && (
          <div className="p-4 space-y-6">
            
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Collection</h3>
              <button 
                onClick={togglePause}
                className={`w-full py-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-sm transition-all
                  ${settings.collectionEnabled ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}
                `}
              >
                {settings.collectionEnabled ? <><Pause size={16}/> Pause Collection</> : <><Play size={16}/> Resume Collection</>}
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Review Threshold</h3>
              <div className="flex items-center gap-2 bg-white border border-slate-200 p-2 rounded-lg">
                 <AlertTriangle size={16} className="text-amber-500"/>
                 {/* P0-2: Stale closure safe update */}
                 <input 
                   type="number" 
                   value={settings.softThreshold} 
                   onChange={(e) => {
                     const val = parseInt(e.target.value) || 0;
                     setSettings(prev => {
                       const newSettings = { ...prev, softThreshold: val };
                       api.set({ [KEYS.SETTINGS]: newSettings });
                       return newSettings;
                     });
                   }}
                   className="flex-1 text-sm outline-none"
                 />
                 <span className="text-xs text-slate-400">min score</span>
              </div>
              <p className="text-[10px] text-slate-400">
                Domains with only "view" activity will appear in the Review tab if their score exceeds this value.
              </p>
            </div>
            
            {/* P1-2: Hidden Items Management */}
            {ignoredList.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hidden Items ({ignoredList.length})</h3>
                <div className="bg-white border border-slate-200 rounded-lg max-h-32 overflow-y-auto divide-y divide-slate-100">
                  {ignoredList.map(item => (
                    <div key={item.domain} className="px-3 py-2 flex items-center justify-between">
                       <span className="text-xs font-medium text-slate-600 truncate">{item.domain}</span>
                       <button 
                         onClick={() => updateOverride(item.domain, { ignored: false })}
                         className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                         title="Restore"
                       >
                         <Undo2 size={12} />
                       </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-slate-200">
              <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider">Danger Zone</h3>
              <button onClick={runCleanup} className="w-full py-2 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-200 flex items-center justify-center gap-2">
                 <Eraser size={14} /> Run Retention Policy Now
              </button>
              <button onClick={resetAll} className="w-full py-2 bg-white text-rose-600 border border-rose-200 rounded-lg text-xs font-bold hover:bg-rose-50 flex items-center justify-center gap-2">
                 <Trash2 size={14} /> Factory Reset
              </button>
            </div>
          </div>
        )}

      </div>

      {!isExtensionEnv && (
         <div className="absolute top-0 right-0 bg-red-500 text-white text-[9px] px-1 py-0.5 font-bold">PREVIEW MODE</div>
      )}
    </div>
  );
};

// --- SIMULATOR TOOL (Kept for Dev) ---
const DevSimulator = () => {
  const [simUrl, setSimUrl] = useState('https://www.google.com/account/login');
  
  const simulateVisit = async () => {
    try {
      await chrome.webNavigation.onCompleted.dispatch({ frameId: 0, url: simUrl, timeStamp: Date.now() });
    } catch (e) { console.warn("Sim only works in extension context or with better mocks"); }
  };

  return (
    <div className="absolute -right-[340px] top-0 w-[320px] bg-slate-800 p-4 rounded-lg text-white shadow-xl border border-slate-600">
      <div className="flex items-center gap-2 mb-3 text-emerald-400">
        <LayoutDashboard size={16} />
        <h3 className="font-bold text-sm">Dev Simulator</h3>
      </div>
      <input 
        value={simUrl} 
        onChange={e => setSimUrl(e.target.value)}
        className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs mb-2 text-slate-200 font-mono"
      />
      <button 
        onClick={simulateVisit}
        className="w-full bg-indigo-600 hover:bg-indigo-500 py-1 rounded text-xs font-bold"
      >
        Simulate Visit
      </button>
    </div>
  );
};

const App = () => {
  return (
    <div className="relative flex justify-center items-center h-full bg-slate-200">
      <div className="w-[360px] h-[500px] shadow-2xl relative bg-white">
        <Popup />
      </div>
      {!isExtensionEnv && <DevSimulator />}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);