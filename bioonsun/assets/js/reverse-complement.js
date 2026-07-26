// BioOnSun — Reverse Complement tool logic
// All computation happens locally in the browser; no sequence data is ever sent anywhere.
(function () {
  'use strict';

  // IUPAC nucleotide complement map (uppercase keys/values).
  // A/T, C/G, U(RNA)->A ; ambiguity codes: R<->Y, K<->M, B<->V, D<->H ; S, W, N self-complementary.
  var COMPLEMENT = {
    A: 'T', T: 'A', U: 'A', C: 'G', G: 'C',
    R: 'Y', Y: 'R',
    S: 'S', W: 'W',
    K: 'M', M: 'K',
    B: 'V', V: 'B',
    D: 'H', H: 'D',
    N: 'N'
  };

  function complementChar(ch) {
    var upper = ch.toUpperCase();
    var comp = COMPLEMENT[upper];
    if (comp === undefined) return ch; // unrecognized character: pass through unchanged
    var isLower = ch !== upper;
    return isLower ? comp.toLowerCase() : comp;
  }

  function reverseString(s) {
    return s.split('').reverse().join('');
  }

  function complementString(s) {
    return s.split('').map(complementChar).join('');
  }

  function wrap(seq, width) {
    if (!width || seq.length <= width) return seq;
    var out = [];
    for (var i = 0; i < seq.length; i += width) {
      out.push(seq.slice(i, i + width));
    }
    return out.join('\n');
  }

  // Transform a plain (non-FASTA) block of text according to mode.
  // 'revcomp': reverse the whole string, complementing recognized nucleotide letters.
  // 'reverse': reverse the whole string only.
  // 'complement': complement recognized letters, keep original order.
  function transformPlain(text, mode) {
    if (mode === 'complement') return complementString(text);
    if (mode === 'reverse') return reverseString(text);
    // revcomp
    return reverseString(text).split('').map(complementChar).join('');
  }

  function isFastaText(text) {
    return text.split(/\r\n|\r|\n/).some(function (line) {
      return line.trim().charAt(0) === '>';
    });
  }

  // FASTA-aware transform: headers are preserved as-is; each sequence body
  // (multi-line FASTA sequences are joined first) is transformed and re-wrapped at 60 chars.
  function transformFasta(text, mode) {
    var lines = text.split(/\r\n|\r|\n/);
    var out = [];
    var seqLines = [];
    var haveHeader = false;

    function flush() {
      if (seqLines.length === 0) return;
      var joined = seqLines.join('');
      var transformed = transformPlain(joined, mode);
      out.push(wrap(transformed, 60));
      seqLines = [];
    }

    lines.forEach(function (line) {
      if (line.trim().charAt(0) === '>') {
        flush();
        haveHeader = true;
        out.push(line);
      } else {
        seqLines.push(line);
      }
    });
    flush();
    return out.join('\n');
  }

  function process(text, mode) {
    if (!text) return '';
    return isFastaText(text) ? transformFasta(text, mode) : transformPlain(text, mode);
  }

  function sequenceStats(text) {
    var letters = text.replace(/[^A-Za-z]/g, '');
    // strip fasta headers from stats
    if (isFastaText(text)) {
      letters = text.split(/\r\n|\r|\n/).filter(function (l) {
        return l.trim().charAt(0) !== '>';
      }).join('').replace(/[^A-Za-z]/g, '');
    }
    var len = letters.length;
    var gc = 0, at = 0, other = 0;
    for (var i = 0; i < letters.length; i++) {
      var u = letters[i].toUpperCase();
      if (u === 'G' || u === 'C') gc++;
      else if (u === 'A' || u === 'T' || u === 'U') at++;
      else other++;
    }
    var gcPct = len ? ((gc / len) * 100).toFixed(1) : '0.0';
    return { length: len, gc: gc, at: at, other: other, gcPct: gcPct };
  }

  function init(root) {
    var input = root.querySelector('[data-role="input"]');
    var output = root.querySelector('[data-role="output"]');
    var tabs = root.querySelectorAll('[data-mode]');
    var statLength = root.querySelector('[data-role="stat-length"]');
    var statGc = root.querySelector('[data-role="stat-gc"]');
    var btnCopy = root.querySelector('[data-role="copy"]');
    var btnDownload = root.querySelector('[data-role="download"]');
    var btnClear = root.querySelector('[data-role="clear"]');
    var btnSample = root.querySelector('[data-role="sample"]');
    var currentMode = 'revcomp';

    var i18n = root.getAttribute('data-i18n') === 'en'
      ? { copied: 'Copied to clipboard', cleared: 'Cleared', noInput: 'Paste a sequence first' }
      : { copied: '클립보드에 복사했습니다', cleared: '초기화했습니다', noInput: '먼저 서열을 입력해주세요' };

    var sampleSeq = root.getAttribute('data-sample') ||
      '>demo_sequence\nATGCGTACGTTAGCWSKMBDHVNatgcgtacgttagc';

    function run() {
      var text = input.value;
      var result = process(text, currentMode);
      output.value = result;
      var stats = sequenceStats(text);
      if (statLength) statLength.textContent = stats.length.toLocaleString();
      if (statGc) statGc.textContent = stats.length ? stats.gcPct + '%' : '--';
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        currentMode = tab.getAttribute('data-mode');
        run();
      });
    });

    input.addEventListener('input', run);

    if (btnCopy) {
      btnCopy.addEventListener('click', function () {
        if (!output.value) { window.BioOnSun.toast(i18n.noInput); return; }
        window.BioOnSun.copyText(output.value, i18n.copied);
      });
    }
    if (btnDownload) {
      btnDownload.addEventListener('click', function () {
        if (!output.value) { window.BioOnSun.toast(i18n.noInput); return; }
        window.BioOnSun.download('reverse-complement.fasta', output.value);
      });
    }
    if (btnClear) {
      btnClear.addEventListener('click', function () {
        input.value = '';
        run();
        window.BioOnSun.toast(i18n.cleared);
        input.focus();
      });
    }
    if (btnSample) {
      btnSample.addEventListener('click', function () {
        input.value = sampleSeq;
        run();
      });
    }

    run();
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-tool="reverse-complement"]').forEach(init);
  });

  // exposed for potential unit testing
  window.BioOnSunRevComp = { process: process, sequenceStats: sequenceStats };
})();
