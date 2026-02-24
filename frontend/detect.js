/* detect.js
 * Client-side device detection and version switching
 * Safety net for when server-side detection fails (CDN, cache, proxy)
 * Also handles cookie consent banner
 */
(function () {
  "use strict";

  // Skip if user manually chose a version
  var forced = sessionStorage.getItem('forcedVersion');
  if (forced === 'desktop' && window.location.pathname !== '/index.html' && !window.location.pathname.endsWith('index.html')) return;
  if (forced === 'mobile' && window.location.pathname !== '/mobile.html' && !window.location.pathname.endsWith('mobile.html')) return;

  var ua = navigator.userAgent || '';
  var w = window.innerWidth || window.screen.width;

  // Device detection
  var isMobile = /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) || w < 768;
  var isTablet = /iPad|Tablet|(Android(?!.*Mobile))/i.test(ua) || (w >= 768 && w < 1024);
  
  // Current page
  var pathParts = window.location.pathname.split('/');
  var currentPage = pathParts[pathParts.length - 1] || 'index.html';

  var targetPage = null;

  // Routing logic
  if (isMobile && currentPage !== 'mobile.html') {
    targetPage = 'mobile.html';
  } else if (isTablet && currentPage !== 'mobile.html') {
    targetPage = 'mobile.html';
  } else if (!isMobile && !isTablet && currentPage === 'mobile.html') {
    targetPage = '/';
  }

  if (targetPage) {
    // Use replace to avoid creating history entries
    window.location.replace(targetPage);
  }
})();

/* Version switcher functions - exposed globally */
function switchToDesktop() {
  sessionStorage.setItem('forcedVersion', 'desktop');
  window.location.href = '/index.html';
}

function switchToMobile() {
  sessionStorage.setItem('forcedVersion', 'mobile');
  window.location.href = '/mobile.html';
}

function clearVersionPreference() {
  sessionStorage.removeItem('forcedVersion');
}

/* =====================================================
   COOKIE CONSENT BANNER
   ===================================================== */
(function () {
  "use strict";

  var CONSENT_KEY = 'cookieConsent';
  var CONSENT_DATE_KEY = 'cookieConsentDate';
  var EXPIRE_DAYS = 180;

  function checkCookieConsent() {
    var consent = localStorage.getItem(CONSENT_KEY);
    var timestamp = localStorage.getItem(CONSENT_DATE_KEY);

    if (!consent) {
      showBanner();
      return;
    }

    // Re-ask after EXPIRE_DAYS
    if (timestamp) {
      var daysPassed = (Date.now() - parseInt(timestamp, 10)) / (1000 * 60 * 60 * 24);
      if (daysPassed > EXPIRE_DAYS) {
        localStorage.removeItem(CONSENT_KEY);
        localStorage.removeItem(CONSENT_DATE_KEY);
        showBanner();
        return;
      }
    }

    hideBanner();
  }

  function acceptCookies() {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    localStorage.setItem(CONSENT_DATE_KEY, Date.now().toString());
    hideBanner();
  }

  function declineCookies() {
    localStorage.setItem(CONSENT_KEY, 'declined');
    localStorage.setItem(CONSENT_DATE_KEY, Date.now().toString());
    hideBanner();
  }

  function showBanner() {
    var banner = document.getElementById('cookie-banner');
    if (banner) {
      banner.removeAttribute('hidden');
      // Animate in after small delay so CSS transition fires
      setTimeout(function () {
        banner.classList.add('visible');
      }, 50);
    }
  }

  function hideBanner() {
    var banner = document.getElementById('cookie-banner');
    if (banner) {
      banner.classList.remove('visible');
      banner.classList.add('hiding');
      setTimeout(function () {
        banner.setAttribute('hidden', '');
      }, 400);
    }
  }

  // Expose functions globally for onclick handlers
  window.acceptCookies = acceptCookies;
  window.declineCookies = declineCookies;

  // Check on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkCookieConsent);
  } else {
    checkCookieConsent();
  }
})();
