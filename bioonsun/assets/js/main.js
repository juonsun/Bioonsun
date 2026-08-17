// BioOnSun — shared site behaviour (nav toggle, toast helper)
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.querySelector('.main-nav');

    // "분석도구" / "고객지원" nav dropdowns: click(tap)-to-open, same on
    // desktop and mobile (no hover). Only one open at a time.
    var dropdowns = nav ? nav.querySelectorAll('.nav-dropdown') : [];
    function closeAllDropdowns(except) {
      dropdowns.forEach(function (dd) {
        if (dd === except) return;
        dd.classList.remove('open');
        var btn = dd.querySelector('.nav-dropdown-toggle');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
    }
    dropdowns.forEach(function (dd) {
      var btn = dd.querySelector('.nav-dropdown-toggle');
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var wasOpen = dd.classList.contains('open');
        closeAllDropdowns();
        if (!wasOpen) {
          dd.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
    document.addEventListener('click', function () { closeAllDropdowns(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAllDropdowns();
    });

    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        nav.classList.toggle('open');
        var expanded = nav.classList.contains('open');
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        closeAllDropdowns();
      });
      nav.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          nav.classList.remove('open');
          closeAllDropdowns();
        });
      });
    }

    // FAQ analytics-free auto-close siblings is intentionally NOT implemented
    // so multiple FAQ items can stay open at once (better UX for reference content).
  });

  window.BioOnSun = window.BioOnSun || {};

  window.BioOnSun.toast = function (message) {
    var el = document.getElementById('bos-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bos-toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () {
      el.classList.remove('show');
    }, 1800);
  };

  window.BioOnSun.copyText = function (text, successMessage) {
    if (!text) return;
    var done = function () {
      window.BioOnSun.toast(successMessage || 'Copied');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        window.BioOnSun.fallbackCopy(text);
        done();
      });
    } else {
      window.BioOnSun.fallbackCopy(text);
      done();
    }
  };

  window.BioOnSun.fallbackCopy = function (text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* no-op */ }
    document.body.removeChild(ta);
  };

  window.BioOnSun.download = function (filename, text, mimeType) {
    var blob = new Blob([text], { type: mimeType || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };
})();
