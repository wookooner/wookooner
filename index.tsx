import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Shield, 
  Activity, 
  Trash2, 
  Pause, 
  Play, 
  Clock, 
  BarChart2, 
  Globe, 
  AlertCircle,
  Construction
} from 'lucide-react';

// Declare chrome to avoid TS errors
declare const chrome: any;

// --- Types ---

interface RawEvent {
  ts: number;
  domain: string;
  type: 'page_view';
}

interface AppSettings {
  collectionEnabled: boolean;
  maxEvents: number;
}

// --- ENVIRONMENT DETECTION ---

const isExtensionEnv = typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;

// --- API ABSTRACTION ---
// This allows the same UI code to run in the Web Preview (Mock) and the Real Extension.

const api = {
  get: (keys: string[]) => {
    if (isExtensionEnv) {
      return chrome.storage.local.get(keys);
    } else {
      // Mock for Web Preview
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
      // Mock for Web Preview
      return new Promise<void>((resolve) => {
        Object.entries(items).forEach(([k, v]) => {
          localStorage.setItem(k, JSON.stringify(v));
        });
        window.dispatchEvent(new Event('storage')); // Trigger update
        resolve();
      });
    }
  }
};

// --- Constants ---
const EVENTS_KEY = 'pdtm_events_v1';
const SETTINGS_KEY = 'pdtm_settings_v1';


// --- COMPONENT: Popup UI ---

const Popup = () => {
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ collectionEnabled: true, maxEvents: 1000 });
  const [activeTab, setActiveTab] = useState<'recent' | 'top'>('recent');
  const [loading, setLoading] = useState(true);

  // Load Data
  const refreshData = async () => {
    const data = await api.get([EVENTS_KEY, SETTINGS_KEY]);
    setEvents(data[EVENTS_KEY] || []);
    if (data[SETTINGS_KEY]) {
      setSettings(data[SETTINGS_KEY]);
    }
    setLoading(false);
  };

  // --- CRITICAL FIX: Real-time Updates ---
  // In a real extension, we must listen to chrome.storage.onChanged.
  // In the web preview, we listen to window 'storage' events.
  useEffect(() => {
    refreshData();

    if (isExtensionEnv) {
      // Real Chrome Extension Listener
      const listener = (changes: any, areaName: string) => {
        if (areaName === 'local') {
          if (changes[EVENTS_KEY] || changes[SETTINGS_KEY]) {
            refreshData();
          }
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    } else {
      // Web Preview Listener
      const listener = () => refreshData();
      window.addEventListener('storage', listener);
      return () => window.removeEventListener('storage', listener);
    }
  }, []);

  // Actions
  const handleClear = async () => {
    if (confirm('Delete all locally stored traces?')) {
      await api.set({ [EVENTS_KEY]: [] });
      if (isExtensionEnv) chrome.action.setBadgeText({ text: '' });
      refreshData();
    }
  };

  const handleTogglePause = async () => {
    const newStatus = !settings.collectionEnabled;
    await api.set({ 
      [SETTINGS_KEY]: { ...settings, collectionEnabled: newStatus } 
    });
    refreshData();
  };

  // Derived State
  const topDomains = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => {
      counts[e.domain] = (counts[e.domain] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
  }, [events]);

  const recentEvents = useMemo(() => {
    return [...events].slice(0, 20); // Storage should already be sorted new -> old
  }, [events]);

  if (loading) return <div className="h-full flex items-center justify-center text-slate-400">Loading...</div>;

  return (
    <div className="flex flex-col h-full bg-white font-sans text-slate-900">
      
      {/* Header */}
      <div className="bg-slate-900 text-white p-4 shrink-0 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-indigo-400" />
          <h1 className="font-bold text-sm tracking-wide">PDTM <span className="text-slate-500 text-xs font-normal">v0.1</span></h1>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${settings.collectionEnabled ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-300' : 'bg-amber-500/10 border-amber-500/50 text-amber-300'}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${settings.collectionEnabled ? 'bg-indigo-400 animate-pulse' : 'bg-amber-400'}`} />
          {settings.collectionEnabled ? 'Active' : 'Paused'}
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-end">
        <div>
          <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mb-1">Total Traces</p>
          <div className="text-3xl font-bold text-slate-800 leading-none">{events.length}</div>
        </div>
        <div className="text-xs text-slate-400 text-right">
          <p>Local Storage Only</p>
          <p>No Cloud Upload</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('recent')}
          className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'recent' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-500 bg-slate-50 hover:bg-slate-100'}`}
        >
          <Clock size={14} /> Recent
        </button>
        <button 
          onClick={() => setActiveTab('top')}
          className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'top' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-500 bg-slate-50 hover:bg-slate-100'}`}
        >
          <BarChart2 size={14} /> Top Sites
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto bg-white p-0 scrollbar-thin">
        {events.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
            <Activity size={32} className="mb-2 opacity-20" />
            <p className="text-sm">No traces collected.</p>
          </div>
        ) : activeTab === 'recent' ? (
          <ul className="divide-y divide-slate-100">
            {recentEvents.map((e, i) => (
              <li key={e.ts + '_' + i} className="p-3 hover:bg-slate-50 flex items-center gap-3 group animate-in fade-in slide-in-from-bottom-1 duration-200">
                <div className="bg-slate-100 p-1.5 rounded text-slate-500">
                  <Globe size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate" title={e.domain}>{e.domain}</div>
                  <div className="text-xs text-slate-400 font-mono">
                    {new Date(e.ts).toLocaleTimeString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-slate-100">
            {topDomains.map(([domain, count], i) => (
              <li key={domain} className="p-3 hover:bg-slate-50 flex items-center justify-between group">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-xs font-mono w-5 h-5 flex items-center justify-center rounded ${i < 3 ? 'bg-indigo-100 text-indigo-700 font-bold' : 'bg-slate-100 text-slate-500'}`}>
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-slate-800 truncate">{domain}</span>
                </div>
                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 flex gap-2 shrink-0">
        <button 
          onClick={handleTogglePause}
          className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition-all active:scale-95
            ${settings.collectionEnabled 
              ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100' 
              : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}
        >
          {settings.collectionEnabled ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Resume</>}
        </button>
        <button 
          onClick={handleClear}
          className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-200 flex items-center justify-center gap-1.5 transition-colors active:scale-95"
        >
          <Trash2 size={14} /> Clear
        </button>
      </div>
    </div>
  );
};

// --- SIMULATOR TOOL (Only for this Web Preview) ---
// This component simulates the chrome.storage.local behavior in the web browser
// allowing you to test the logic without loading the unpacked extension.

const DevSimulator = () => {
  const [simUrl, setSimUrl] = useState('https://www.google.com/search?q=test');
  
  const simulateVisit = async () => {
    try {
      const url = new URL(simUrl);
      if (!['http:', 'https:'].includes(url.protocol)) return alert('Invalid protocol');
      const domain = url.hostname;
      
      const data = await api.get([EVENTS_KEY, SETTINGS_KEY]);
      const settings = data[SETTINGS_KEY] || { collectionEnabled: true, maxEvents: 1000 };
      if (!settings.collectionEnabled) return alert('Collection Paused');

      const events = data[EVENTS_KEY] || [];
      const newEvent = { ts: Date.now(), domain, type: 'page_view' };
      
      // Dedupe Logic (Simple)
      if (events.length > 0 && events[0].domain === domain && (Date.now() - events[0].ts < 2000)) {
        console.log("Dedupe in Simulator");
        return;
      }

      const updated = [newEvent, ...events].slice(0, settings.maxEvents);
      await api.set({ [EVENTS_KEY]: updated });
    } catch (e) {
      alert('Invalid URL');
    }
  };

  return (
    <div className="absolute -right-[340px] top-0 w-[320px] bg-slate-800 p-4 rounded-lg text-white shadow-xl border border-slate-600">
      <div className="flex items-center gap-2 mb-3 text-amber-400">
        <Construction size={16} />
        <h3 className="font-bold text-sm">Dev Simulator</h3>
      </div>
      <p className="text-xs text-slate-300 mb-3">
        <b>Web Preview Mode:</b> Use this to generate data.<br/>
        In the real extension, <code>service_worker.js</code> handles this.
      </p>
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

// --- APP ENTRY ---

const App = () => {
  return (
    <div className="relative flex justify-center items-center h-full bg-slate-200">
      <div className="w-[360px] h-[500px] shadow-2xl relative">
        <Popup />
      </div>
      
      {/* Show Simulator only if not in real chrome extension */}
      {!isExtensionEnv && <DevSimulator />}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);