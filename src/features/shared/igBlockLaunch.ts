// Injected into the Instagram reel WebViews (?l=1, full-screen) via
// `injectedJavaScriptBeforeContentLoaded` to stop the live reel page from deep-linking
// into the Instagram app ("open in app" → instagram://reels_share/...), which bounces
// the user out of Vidrip. On some Android WebViews (e.g. OnePlus/OxygenOS) this launch
// escapes react-native-webview's native onShouldStartLoadWithRequest guard, so we have to
// neutralize it IN-PAGE, before IG's own scripts run.
//
// The launch is fired via a hidden iframe / anchor / scripted navigation to an app
// scheme. window.location itself is [Unforgeable] and can't be overridden, but the more
// common iframe/anchor mechanisms CAN be blocked at the source by trapping the element
// property setters (iframe.src, anchor.href), setAttribute, and innerHTML — so the page
// can never assign an app-scheme target in the first place. We also keep window.open /
// location.assign|replace guards, a capture-phase click swallow, an immediate
// MutationObserver, and a periodic sweep as backstops.
//
// Scoped to the IG WebViews only — it must NOT be applied to OAuth or other in-app
// webviews that legitimately use custom schemes. Keeps Manny's full-screen ?l=1 look.
export const IG_BLOCK_LAUNCH_JS = `(function(){
  try {
    var RE = /^(instagram|intent|fb|fb-messenger|whatsapp|snapchat|tiktok|market|samsungapps):/i;
    function bad(u){ try { var s=String(u||''); return RE.test(s) || s.indexOf('reels_share')>-1; } catch(e){ return false; } }
    // window.open
    try { var _open = window.open; window.open = function(u){ if(bad(u)) return null; try { return _open.apply(window, arguments); } catch(e){ return null; } }; } catch(e){}
    // location.assign / replace
    try { var _a = window.location.assign.bind(window.location); window.location.assign = function(u){ if(bad(u)) return; return _a(u); }; } catch(e){}
    try { var _rp = window.location.replace.bind(window.location); window.location.replace = function(u){ if(bad(u)) return; return _rp(u); }; } catch(e){}
    // Block setAttribute('href'|'src', appscheme) on every element
    try {
      var _setAttr = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function(name, value){
        try { if(name && /^(href|src|xlink:href)$/i.test(name) && bad(value)) return; } catch(e){}
        return _setAttr.apply(this, arguments);
      };
    } catch(e){}
    // Trap property setters: iframe.src and anchor.href (configurable in Chromium, unlike location)
    function guardProp(proto, prop){
      try {
        var d = Object.getOwnPropertyDescriptor(proto, prop);
        if(d && d.set){
          var origSet = d.set, origGet = d.get;
          Object.defineProperty(proto, prop, {
            configurable:true, enumerable:d.enumerable,
            get: function(){ return origGet ? origGet.call(this) : undefined; },
            set: function(v){ if(bad(v)) return; return origSet.call(this, v); }
          });
        }
      } catch(e){}
    }
    if(window.HTMLIFrameElement) guardProp(HTMLIFrameElement.prototype, 'src');
    if(window.HTMLAnchorElement) guardProp(HTMLAnchorElement.prototype, 'href');
    if(window.HTMLFrameElement) guardProp(HTMLFrameElement.prototype, 'src');
    // Sanitize innerHTML strings that carry app-scheme href/src (parser-inserted nodes)
    try {
      var ih = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
      if(ih && ih.set){
        Object.defineProperty(Element.prototype, 'innerHTML', {
          configurable:true, enumerable:ih.enumerable, get:ih.get,
          set: function(v){
            try {
              if(typeof v==='string' && (v.indexOf('instagram:')>-1 || v.indexOf('intent:')>-1 || v.indexOf('reels_share')>-1 || v.indexOf('fb:')>-1)){
                v = v.replace(/(href|src)(\\s*=\\s*)(["'])\\s*(instagram:|intent:|fb:|fb-messenger:|whatsapp:|snapchat:|tiktok:)[^"']*\\3/gi, '$1$2$3#blocked$3').replace(/reels_share/gi, 'blocked');
              }
            } catch(e){}
            return ih.set.call(this, v);
          }
        });
      }
    } catch(e){}
    // Capture-phase click swallow for app-scheme anchors
    try {
      document.addEventListener('click', function(e){
        try { var a = e.target && e.target.closest && e.target.closest('a'); if(a && a.getAttribute && bad(a.getAttribute('href'))){ e.preventDefault(); e.stopImmediatePropagation(); } } catch(_){}
      }, true);
    } catch(e){}
    // Immediate MutationObserver: neuter app-scheme nodes the instant they're added
    function clean(node){
      try {
        if(!node || node.nodeType!==1) return;
        var tag = node.tagName;
        if(tag==='IFRAME' || tag==='A' || tag==='META' || tag==='FRAME'){
          var v = node.getAttribute && (node.getAttribute('href')||node.getAttribute('src')||node.getAttribute('content')||'');
          if(bad(v)){ if(node.parentNode){ node.parentNode.removeChild(node); } else if(tag==='A'){ node.removeAttribute('href'); } else { node.removeAttribute('src'); } }
        }
        if(node.querySelectorAll){ var bs = node.querySelectorAll('a[href],iframe[src],frame[src],meta[http-equiv]'); for(var i=0;i<bs.length;i++){ clean(bs[i]); } }
      } catch(_){}
    }
    try {
      new MutationObserver(function(muts){ for(var i=0;i<muts.length;i++){ var ad=muts[i].addedNodes; for(var j=0;j<ad.length;j++){ clean(ad[j]); } } }).observe(document.documentElement||document, {childList:true, subtree:true});
    } catch(e){}
    // Periodic sweep backstop
    function strip(){ try { var els = document.querySelectorAll('a[href],iframe[src],frame[src],meta[http-equiv]'); for (var i=0;i<els.length;i++){ clean(els[i]); } } catch(_){} }
    strip(); setInterval(strip, 200);
    document.addEventListener('DOMContentLoaded', strip);
  } catch(e){}
})(); true;`;
