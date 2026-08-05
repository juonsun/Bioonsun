// BioOnSun — shared site behaviour (nav toggle, toast helper)
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.querySelector('.main-nav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        nav.classList.toggle('open');
        var expanded = nav.classList.contains('open');
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      });
      nav.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () { nav.classList.remove('open'); });
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
