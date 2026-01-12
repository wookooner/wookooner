// --- Chapter 5: SAML Detector ---
// Role: Detect SAML 2.0 Form Posts
// Privacy: STRICT ISOLATION. No value access. No FormData. No Full URLs.

(function() {
  const SIGNAL_TYPE = 'SAML_FORM_SIGNAL';
  
  // Internal Helper: Simple Hash (DJB2) for structural path fingerprinting
  // Only used in IMPROVED_ACCURACY mode.
  function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
  }

  // Internal Helper: Get eTLD+1 approximation (Inline to avoid dependency)
  function getHostname(urlStr) {
    try {
      const url = new URL(urlStr, window.location.href); // Handle relative paths
      return url.hostname;
    } catch (e) {
      return null;
    }
  }

  function detectSAML() {
    // 1. Find candidate forms
    const forms = document.querySelectorAll('form');
    
    for (const form of forms) {
      // 2. Filter: Method MUST be POST
      const method = (form.getAttribute('method') || '').toLowerCase();
      if (method !== 'post') continue;

      // 3. Filter: MUST contain SAMLResponse input
      // Privacy: Check existence only. NEVER read .value
      const samlInput = form.querySelector('input[name="SAMLResponse"]');
      if (!samlInput) continue;

      // Found a SAML form!
      
      // 4. Extract Safe Metadata
      // Note: We don't know the Privacy Mode here synchronously (async storage).
      // Strategy: Collect "Safe-ish" data, let Service Worker filter based on Mode.
      
      const actionAttr = form.getAttribute('action');
      const actionHostname = getHostname(actionAttr);
      
      // Check for RelayState (Auxiliary signal, existence only)
      const hasRelayState = !!form.querySelector('input[name="RelayState"]');

      // 5. Construct Payload (Strictly Structural)
      const payload = {
        hasSamlForm: true,
        hasRelayState: hasRelayState,
        // We send potential data; SW will drop 'action' fields if mode is STRICT
        actionDomain: actionHostname, 
        // Hash the path to avoid storing PII in URL path, but allow structure matching
        actionPathHash: actionAttr ? simpleHash(actionAttr) : null
      };

      // 6. Send Signal
      chrome.runtime.sendMessage({
        type: SIGNAL_TYPE,
        payload: payload,
        timestamp: Date.now()
      });

      // Stop after finding one valid SAML form to prevent noise
      return; 
    }
  }

  // Execution Strategy: Immediate + Retry (to catch dynamic forms)
  const runDetection = () => {
    detectSAML();
  };

  if (document.readyState === 'complete') {
    runDetection();
  } else {
    window.addEventListener('load', runDetection);
  }
  
  // Retry once for dynamic loading
  setTimeout(runDetection, 1500);

})();
