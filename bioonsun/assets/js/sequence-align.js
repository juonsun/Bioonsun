// BioOnSun — Sequence alignment/comparison tool UI
// The heavy O(n*m) DP computation runs in a Web Worker (sequence-align-worker.js)
// so the page never freezes. sequence-align-core.js is also loaded directly on
// the page for instant type-detection previews and as a same-thread fallback if
// Web Workers are unavailable. No sequence data is ever sent to a server.
(function () {
  'use strict';

  var LINE_WIDTH = 60;
  var DEBOUNCE_MS = 450;

  function padRight(str, len) {
    str = String(str == null ? '' : str);
    if (str.length > len) return str.slice(0, len);
    while (str.length < len) str += ' ';
    return str;
  }
  function padLeft(str, len) {
    str = String(str == null ? '' : str);
    while (str.length < len) str = ' ' + str;
    return str;
  }
  function truncateName(name, max) {
    if (!name) return '';
    return name.length > max ? name.slice(0, max - 1) + '…' : name;
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildAlignmentText(alignedA, alignedB, symbolLine, nameA, nameB, startA, startB) {
    var labelWidth = Math.max(truncateName(nameA, 14).length, truncateName(nameB, 14).length, 4) + 1;
    var maxPos = Math.max(startA + alignedA.length, startB + alignedB.length);
    var posWidth = String(maxPos).length;
    var lines = [];
    var posA = startA, posB = startB;

    for (var i = 0; i < alignedA.length; i += LINE_WIDTH) {
      var chunkA = alignedA.slice(i, i + LINE_WIDTH);
      var chunkB = alignedB.slice(i, i + LINE_WIDTH);
      var chunkSym = symbolLine.slice(i, i + LINE_WIDTH);
      var consumedA = chunkA.replace(/-/g, '').length;
      var consumedB = chunkB.replace(/-/g, '').length;

      var lineAEndPos = consumedA ? (posA + consumedA - 1) : (posA - 1);
      var lineBEndPos = consumedB ? (posB + consumedB - 1) : (posB - 1);

      lines.push(
        padRight(truncateName(nameA, 14), labelWidth) + padLeft(String(consumedA ? posA : lineAEndPos), posWidth) + ' ' + chunkA + ' ' + lineAEndPos
      );
      lines.push(padRight('', labelWidth) + padLeft('', posWidth) + ' ' + chunkSym);
      lines.push(
        padRight(truncateName(nameB, 14), labelWidth) + padLeft(String(consumedB ? posB : lineBEndPos), posWidth) + ' ' + chunkB + ' ' + lineBEndPos
      );
      lines.push('');

      posA += consumedA;
      posB += consumedB;
    }
    return lines.join('\n').replace(/\n+$/, '');
  }

  function init(root) {
    var isEn = root.getAttribute('data-i18n') === 'en';
    var workerPath = root.getAttribute('data-worker');

    var i18n = isEn ? {
      unnamedA: 'Sequence A', unnamedB: 'Sequence B',
      cleared: 'Cleared',
      noInput: 'Paste both sequences first',
      tooLong: function (max) { return 'Sequences must be ' + max + ' characters or shorter (this keeps the alignment fast in your browser).'; },
      emptyA: 'Sequence A is empty', emptyB: 'Sequence B is empty',
      computing: 'Computing alignment…',
      typeMismatch: function (a, b) { return 'Sequence A looks like ' + a.toUpperCase() + ' and sequence B looks like ' + b.toUpperCase() + ' — pick a sequence type manually above if this is wrong.'; },
      truncatedNote: 'Multiple ">" records were pasted — only the first record of each box is used.',
      exactMatch: 'Sequences are identical (100% match)',
      veryHigh: function (p) { return 'Highly similar — ' + p + '% identity'; },
      partial: function (p) { return 'Partially similar — ' + p + '% identity'; },
      lowSim: function (p) { return 'Largely different — ' + p + '% identity'; },
      noLocalMatch: 'No similar region was found (local alignment score is 0).',
      localNote: function (sa, ea, sb, eb) { return '(Local alignment — aligned region: A ' + sa + '–' + ea + ', B ' + sb + '–' + eb + ')'; },
      identity: 'Identity', similarity: 'Similarity', alignLength: 'Alignment length', gaps: 'Gaps', score: 'Score',
      diffPositionsLabel: 'Differing alignment columns',
      diffNone: 'No differences — the aligned region matches perfectly.',
      diffMore: function (n) { return ' (+' + n + ' more)'; },
      copied: 'Copied to clipboard',
      reportTitle: 'BioOnSun Sequence Alignment Report',
      generated: 'Generated', mode: 'Mode', seqType: 'Sequence type', matrix: 'Substitution matrix',
      matchScore: 'Match score', mismatchScore: 'Mismatch score', gapOpenL: 'Gap open', gapExtendL: 'Gap extend',
      lengthA: 'Length A', lengthB: 'Length B',
      global: 'Global (Needleman-Wunsch)', local: 'Local (Smith-Waterman)',
      dna: 'DNA', rna: 'RNA', protein: 'Protein'
    } : {
      unnamedA: '서열 A', unnamedB: '서열 B',
      cleared: '초기화했습니다',
      noInput: '먼저 두 서열을 모두 입력해주세요',
      tooLong: function (max) { return '서열은 ' + max + '자 이하로 입력해주세요 (브라우저에서 빠르게 계산하기 위한 제한입니다).'; },
      emptyA: '서열 A가 비어 있습니다', emptyB: '서열 B가 비어 있습니다',
      computing: '정렬 계산 중…',
      typeMismatch: function (a, b) {
        var label = { dna: 'DNA', rna: 'RNA', protein: '단백질' };
        return '서열 A는 ' + label[a] + ', 서열 B는 ' + label[b] + '(으)로 감지되었습니다. 다르다면 위에서 서열 종류를 직접 선택해주세요.';
      },
      truncatedNote: '">" 헤더가 여러 개 포함된 입력이 감지되어, 각 입력창에서 첫 번째 서열만 사용됩니다.',
      exactMatch: '완전히 일치합니다 (100% 동일)',
      veryHigh: function (p) { return '매우 유사합니다 — 일치율 ' + p + '%'; },
      partial: function (p) { return '부분적으로 유사합니다 — 일치율 ' + p + '%'; },
      lowSim: function (p) { return '많이 다릅니다 — 일치율 ' + p + '%'; },
      noLocalMatch: '유사한 구간을 찾지 못했습니다 (지역 정렬 점수 0).',
      localNote: function (sa, ea, sb, eb) { return '(지역 정렬 — 정렬된 구간: A ' + sa + '–' + ea + ', B ' + sb + '–' + eb + ')'; },
      identity: '일치율 (Identity)', similarity: '유사율 (Similarity)', alignLength: '정렬 길이', gaps: '갭 (Gap)', score: '정렬 점수',
      diffPositionsLabel: '차이 나는 정렬 위치',
      diffNone: '차이가 없습니다 — 정렬된 구간이 완벽히 일치합니다.',
      diffMore: function (n) { return ' (외 ' + n + '개 더)'; },
      copied: '클립보드에 복사했습니다',
      reportTitle: 'BioOnSun 서열 정렬 비교 결과',
      generated: '생성 시각', mode: '정렬 방식', seqType: '서열 종류', matrix: '치환 매트릭스',
      matchScore: '일치 점수', mismatchScore: '불일치 점수', gapOpenL: '갭 열기', gapExtendL: '갭 연장',
      lengthA: '서열 A 길이', lengthB: '서열 B 길이',
      global: '전역 정렬 (Needleman-Wunsch)', local: '지역 정렬 (Smith-Waterman)',
      dna: 'DNA', rna: 'RNA', protein: '단백질'
    };

    var els = {
      typeTabs: root.querySelector('[data-role="type-tabs"]'),
      alignModeTabs: root.querySelector('[data-role="align-mode-tabs"]'),
      inputA: root.querySelector('[data-role="input-a"]'),
      inputB: root.querySelector('[data-role="input-b"]'),
      sampleDna: root.querySelector('[data-role="sample-dna"]'),
      sampleProtein: root.querySelector('[data-role="sample-protein"]'),
      clear: root.querySelector('[data-role="clear"]'),
      ntScoreGroups: root.querySelectorAll('[data-role="nt-score-group"]'),
      proteinMatrixGroup: root.querySelector('[data-role="protein-matrix-group"]'),
      matchScore: root.querySelector('[data-role="match-score"]'),
      mismatchScore: root.querySelector('[data-role="mismatch-score"]'),
      gapOpen: root.querySelector('[data-role="gap-open"]'),
      gapExtend: root.querySelector('[data-role="gap-extend"]'),
      typeMismatchWarning: root.querySelector('[data-role="type-mismatch-warning"]'),
      truncateWarning: root.querySelector('[data-role="truncate-warning"]'),
      errorBox: root.querySelector('[data-role="error"]'),
      loading: root.querySelector('[data-role="loading"]'),
      resultWrap: root.querySelector('[data-role="result-wrap"]'),
      verdict: root.querySelector('[data-role="verdict"]'),
      statIdentity: root.querySelector('[data-role="stat-identity"]'),
      statSimilarityTile: root.querySelector('[data-role="stat-similarity-tile"]'),
      statSimilarity: root.querySelector('[data-role="stat-similarity"]'),
      statLength: root.querySelector('[data-role="stat-length"]'),
      statGaps: root.querySelector('[data-role="stat-gaps"]'),
      statScore: root.querySelector('[data-role="stat-score"]'),
      viewer: root.querySelector('[data-role="viewer"]'),
      diffList: root.querySelector('[data-role="diff-list"]'),
      btnCopy: root.querySelector('[data-role="copy"]'),
      btnDownload: root.querySelector('[data-role="download"]')
    };

    var core = window.BioOnSunAlignCore;
    var MAX_LEN = core ? core.MAX_LEN : 2000;

    var state = {
      seqType: 'auto',
      alignMode: 'global',
      lastResult: null,
      lastNameA: '', lastNameB: ''
    };

    var worker = null;
    var jobCounter = 0;
    if (workerPath && typeof Worker !== 'undefined') {
      try { worker = new Worker(workerPath); } catch (e) { worker = null; }
      if (worker) {
        worker.onmessage = function (evt) {
          var data = evt.data || {};
          if (data.jobId !== jobCounter) return; // stale response
          els.loading.hidden = true;
          if (data.ok) {
            handleResult(data.result);
          } else {
            showError(data.error);
          }
        };
        worker.onerror = function () {
          els.loading.hidden = true;
          showError('WORKER_ERROR');
        };
      }
    }

    function setTabGroup(container, value, onChange) {
      var buttons = container.querySelectorAll('.mode-tab');
      buttons.forEach(function (btn) {
        var active = btn.getAttribute('data-value') === value;
        btn.classList.toggle('active', active);
      });
    }

    function clearMessages() {
      els.typeMismatchWarning.hidden = true;
      els.truncateWarning.hidden = true;
      els.errorBox.hidden = true;
    }

    function showError(code) {
      var msg;
      if (code === 'TOO_LONG') msg = i18n.tooLong(MAX_LEN);
      else if (code === 'EMPTY_SEQUENCE') msg = i18n.noInput;
      else msg = isEn ? 'Something went wrong while computing the alignment.' : '정렬 계산 중 문제가 발생했습니다.';
      els.errorBox.textContent = msg;
      els.errorBox.hidden = false;
      els.resultWrap.hidden = true;
    }

    function currentOptions() {
      var match = parseFloat(els.matchScore.value);
      var mismatch = parseFloat(els.mismatchScore.value);
      var gapOpen = parseFloat(els.gapOpen.value);
      var gapExtend = parseFloat(els.gapExtend.value);
      return {
        mode: state.alignMode,
        seqType: state.seqType,
        match: isNaN(match) ? 1 : match,
        mismatch: isNaN(mismatch) ? -1 : mismatch,
        gapOpen: isNaN(gapOpen) || gapOpen < 0 ? 10 : gapOpen,
        gapExtend: isNaN(gapExtend) || gapExtend < 0 ? 0.5 : gapExtend
      };
    }

    function updateOptionVisibility(previewSeqA, previewSeqB) {
      var effectiveType = state.seqType;
      if (effectiveType === 'auto' && core) {
        var ta = previewSeqA ? core.detectType(previewSeqA) : 'dna';
        var tb = previewSeqB ? core.detectType(previewSeqB) : 'dna';
        effectiveType = (ta === 'protein' || tb === 'protein') ? 'protein' : ((ta === 'rna' || tb === 'rna') ? 'rna' : 'dna');
      }
      var isProtein = effectiveType === 'protein';
      els.ntScoreGroups.forEach(function (g) { g.hidden = isProtein; });
      if (els.proteinMatrixGroup) els.proteinMatrixGroup.hidden = !isProtein;
      return effectiveType;
    }

    function verdictInfo(result) {
      var pct = result.identity.toFixed(1);
      if (result.mode === 'local' && result.alignLength === 0) {
        return { text: i18n.noLocalMatch, cls: 'mismatch' };
      }
      var exact = result.mode === 'global' && result.gapCount === 0 && result.identity === 100;
      var text, cls;
      if (exact) { text = i18n.exactMatch; cls = 'match'; }
      else if (result.identity >= 90) { text = i18n.veryHigh(pct); cls = 'match'; }
      else if (result.identity >= 70) { text = i18n.partial(pct); cls = 'partial'; }
      else { text = i18n.lowSim(pct); cls = 'mismatch'; }
      if (result.mode === 'local' && result.alignLength > 0) {
        text += ' ' + i18n.localNote(result.startA, result.endA, result.startB, result.endB);
      }
      return { text: text, cls: cls };
    }

    function buildReport(result) {
      var lines = [];
      lines.push(i18n.reportTitle);
      lines.push(i18n.generated + ': ' + new Date().toLocaleString());
      lines.push('');
      lines.push(state.lastNameA + ' | ' + i18n.lengthA + ': ' + result.lengthA);
      lines.push(state.lastNameB + ' | ' + i18n.lengthB + ': ' + result.lengthB);
      lines.push(i18n.mode + ': ' + (result.mode === 'local' ? i18n.local : i18n.global));
      lines.push(i18n.seqType + ': ' + i18n[result.resolvedType]);
      if (result.usedMatrix) {
        lines.push(i18n.matrix + ': ' + result.usedMatrix);
      } else {
        lines.push(i18n.matchScore + ': ' + (els.matchScore.value || 1));
        lines.push(i18n.mismatchScore + ': ' + (els.mismatchScore.value || -1));
      }
      lines.push(i18n.gapOpenL + ': ' + result.gapOpen);
      lines.push(i18n.gapExtendL + ': ' + result.gapExtend);
      lines.push('');
      lines.push(verdictInfo(result).text);
      lines.push(
        i18n.identity + ': ' + result.identity.toFixed(1) + '% (' + result.identityCount + '/' + result.alignLength + ')' +
        (result.usedMatrix ? ' | ' + i18n.similarity + ': ' + result.similarity.toFixed(1) + '%' : '') +
        ' | ' + i18n.gaps + ': ' + result.gapCount + ' (' + result.gapPct.toFixed(1) + '%)' +
        ' | ' + i18n.score + ': ' + result.score.toFixed(1)
      );
      lines.push('');
      lines.push(buildAlignmentText(result.alignedA, result.alignedB, result.symbolLine, state.lastNameA, state.lastNameB, result.startA, result.startB));
      return lines.join('\n');
    }

    function renderDiffList(result) {
      var n = result.diffPositions.length;
      if (n === 0) {
        els.diffList.textContent = i18n.diffNone;
        return;
      }
      var shown = result.diffPositions.slice(0, 40);
      var text = shown.join(', ');
      if (n > shown.length) text += i18n.diffMore(n - shown.length);
      els.diffList.textContent = text;
    }

    function handleResult(result) {
      clearMessages();
      state.lastResult = result;

      if (state.seqType === 'auto' && result.typeA !== result.typeB) {
        els.typeMismatchWarning.textContent = i18n.typeMismatch(result.typeA, result.typeB);
        els.typeMismatchWarning.hidden = false;
      }

      var verdict = verdictInfo(result);
      els.verdict.textContent = verdict.text;
      els.verdict.className = 'align-verdict ' + verdict.cls;

      els.statIdentity.textContent = result.identity.toFixed(1) + '%';
      if (result.usedMatrix) {
        els.statSimilarityTile.hidden = false;
        els.statSimilarity.textContent = result.similarity.toFixed(1) + '%';
      } else {
        els.statSimilarityTile.hidden = true;
      }
      els.statLength.textContent = result.alignLength.toLocaleString();
      els.statGaps.textContent = result.gapCount + ' (' + result.gapPct.toFixed(1) + '%)';
      els.statScore.textContent = result.score.toFixed(1);

      els.viewer.textContent = result.alignLength > 0
        ? buildAlignmentText(result.alignedA, result.alignedB, result.symbolLine, state.lastNameA, state.lastNameB, result.startA, result.startB)
        : '';

      renderDiffList(result);

      els.resultWrap.hidden = false;
    }

    function runAlignment() {
      clearMessages();
      var rawA = els.inputA.value, rawB = els.inputB.value;
      if (!rawA.trim() || !rawB.trim()) {
        els.resultWrap.hidden = true;
        els.loading.hidden = true;
        return;
      }
      if (!core) { showError('CORE_UNAVAILABLE'); return; }

      var parsedA = core.parseSingleInput(rawA);
      var parsedB = core.parseSingleInput(rawB);
      state.lastNameA = parsedA.header ? truncateName(parsedA.header, 24) : i18n.unnamedA;
      state.lastNameB = parsedB.header ? truncateName(parsedB.header, 24) : i18n.unnamedB;

      if (parsedA.truncated || parsedB.truncated) {
        els.truncateWarning.textContent = i18n.truncatedNote;
        els.truncateWarning.hidden = false;
      }

      if (!parsedA.seq || !parsedB.seq) {
        els.resultWrap.hidden = true;
        return;
      }
      if (parsedA.seq.length > MAX_LEN || parsedB.seq.length > MAX_LEN) {
        showError('TOO_LONG');
        return;
      }

      updateOptionVisibility(parsedA.seq, parsedB.seq);

      var opts = currentOptions();
      jobCounter++;
      var myJobId = jobCounter;
      els.loading.hidden = false;
      els.resultWrap.hidden = true;

      if (worker) {
        worker.postMessage({ jobId: myJobId, seqA: parsedA.seq, seqB: parsedB.seq, opts: opts });
      } else {
        // Synchronous fallback (Worker unsupported) — fine for typical input sizes.
        setTimeout(function () {
          if (myJobId !== jobCounter) return;
          els.loading.hidden = true;
          try {
            var result = core.alignSequences(parsedA.seq, parsedB.seq, opts);
            handleResult(result);
          } catch (e) {
            showError(e && e.message);
          }
        }, 10);
      }
    }

    var debounceTimer = null;
    function scheduleRun() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runAlignment, DEBOUNCE_MS);
    }

    els.inputA.addEventListener('input', function () { updateOptionVisibility(els.inputA.value, els.inputB.value); scheduleRun(); });
    els.inputB.addEventListener('input', function () { updateOptionVisibility(els.inputA.value, els.inputB.value); scheduleRun(); });
    [els.matchScore, els.mismatchScore, els.gapOpen, els.gapExtend].forEach(function (input) {
      if (input) input.addEventListener('input', scheduleRun);
    });

    if (els.typeTabs) {
      els.typeTabs.addEventListener('click', function (evt) {
        var btn = evt.target.closest ? evt.target.closest('.mode-tab') : null;
        if (!btn) return;
        state.seqType = btn.getAttribute('data-value');
        setTabGroup(els.typeTabs, state.seqType);
        updateOptionVisibility(els.inputA.value, els.inputB.value);
        scheduleRun();
      });
    }
    if (els.alignModeTabs) {
      els.alignModeTabs.addEventListener('click', function (evt) {
        var btn = evt.target.closest ? evt.target.closest('.mode-tab') : null;
        if (!btn) return;
        state.alignMode = btn.getAttribute('data-value');
        setTabGroup(els.alignModeTabs, state.alignMode);
        scheduleRun();
      });
    }

    if (els.sampleDna) {
      els.sampleDna.addEventListener('click', function () {
        els.inputA.value = root.getAttribute('data-sample-dna-a') || '';
        els.inputB.value = root.getAttribute('data-sample-dna-b') || '';
        state.seqType = 'auto'; setTabGroup(els.typeTabs, 'auto');
        state.alignMode = 'global'; setTabGroup(els.alignModeTabs, 'global');
        els.matchScore.value = 1; els.mismatchScore.value = -1; els.gapOpen.value = 5; els.gapExtend.value = 1;
        updateOptionVisibility(els.inputA.value, els.inputB.value);
        runAlignment();
      });
    }
    if (els.sampleProtein) {
      els.sampleProtein.addEventListener('click', function () {
        els.inputA.value = root.getAttribute('data-sample-protein-a') || '';
        els.inputB.value = root.getAttribute('data-sample-protein-b') || '';
        state.seqType = 'auto'; setTabGroup(els.typeTabs, 'auto');
        state.alignMode = 'global'; setTabGroup(els.alignModeTabs, 'global');
        els.gapOpen.value = 10; els.gapExtend.value = 0.5;
        updateOptionVisibility(els.inputA.value, els.inputB.value);
        runAlignment();
      });
    }
    if (els.clear) {
      els.clear.addEventListener('click', function () {
        els.inputA.value = ''; els.inputB.value = '';
        clearMessages();
        els.resultWrap.hidden = true;
        els.loading.hidden = true;
        window.BioOnSun.toast(i18n.cleared);
        els.inputA.focus();
      });
    }

    if (els.btnCopy) {
      els.btnCopy.addEventListener('click', function () {
        if (!state.lastResult) { window.BioOnSun.toast(i18n.noInput); return; }
        window.BioOnSun.copyText(buildReport(state.lastResult), i18n.copied);
      });
    }
    if (els.btnDownload) {
      els.btnDownload.addEventListener('click', function () {
        if (!state.lastResult) { window.BioOnSun.toast(i18n.noInput); return; }
        window.BioOnSun.download('sequence-alignment-report.txt', buildReport(state.lastResult));
      });
    }

    updateOptionVisibility('', '');
  }

  // Element.closest polyfill guard for very old browsers (no-op if native exists)
  if (window.Element && !Element.prototype.closest) {
    Element.prototype.closest = function (selector) {
      var el = this;
      while (el) {
        if (el.matches && el.matches(selector)) return el;
        el = el.parentElement;
      }
      return null;
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-tool="sequence-align"]').forEach(init);
  });

  window.BioOnSunSequenceAlignUI = { buildAlignmentText: buildAlignmentText };
})();
