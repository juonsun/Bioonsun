// BioOnSun — GC Content calculator tool logic
// All computation happens locally in the browser; no sequence data is ever sent anywhere.
(function () {
  'use strict';

  var BASE_COLORS = {
    G: '#0f7a5c',
    C: '#2f9e6f',
    A: '#e0a458',
    T: '#d1495b',
    N: '#9aa5a2',
    other: '#c9d1cf'
  };

  // ---- Parsing -------------------------------------------------------

  // Splits raw textarea input into one or more records. Plain text with no
  // ">" header becomes a single unnamed record. FASTA headers are kept as
  // the record's display name; only A-Z/a-z characters count as sequence.
  function parseRecords(text) {
    if (!text) return [];
    var lines = text.split(/\r\n|\r|\n/);
    var records = [];
    var current = null;

    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (trimmed.charAt(0) === '>') {
        current = { header: trimmed.slice(1).trim(), rawLines: [] };
        records.push(current);
      } else {
        if (!current) {
          current = { header: null, rawLines: [] };
          records.push(current);
        }
        current.rawLines.push(line);
      }
    });

    return records
      .map(function (r) {
        return { header: r.header, seq: r.rawLines.join('').replace(/[^A-Za-z]/g, '') };
      })
      .filter(function (r) { return r.seq.length > 0; });
  }

  // ---- Composition / stats -------------------------------------------

  function computeComposition(seq) {
    var counts = { A: 0, T: 0, U: 0, G: 0, C: 0, N: 0, other: 0 };
    for (var i = 0; i < seq.length; i++) {
      var u = seq[i].toUpperCase();
      if (Object.prototype.hasOwnProperty.call(counts, u)) counts[u]++;
      else counts.other++;
    }
    var length = seq.length;
    var gc = counts.G + counts.C;
    var atCount = counts.A + counts.T + counts.U;
    var gcPct = length ? (gc / length) * 100 : 0;
    var atPct = length ? (atCount / length) * 100 : 0;
    var nPct = length ? (counts.N / length) * 100 : 0;
    var otherPct = length ? (counts.other / length) * 100 : 0;
    var gcSkew = gc > 0 ? (counts.G - counts.C) / gc : 0;
    var atSkew = atCount > 0 ? (counts.A - (counts.T + counts.U)) / atCount : 0;
    return {
      counts: counts, length: length, gc: gc, at: atCount,
      gcPct: gcPct, atPct: atPct, nPct: nPct, otherPct: otherPct,
      gcSkew: gcSkew, atSkew: atSkew
    };
  }

  // ---- Sliding window GC% ---------------------------------------------

  var MAX_CHART_POINTS = 400;

  function slidingWindowGC(seq, windowSize) {
    var len = seq.length;
    windowSize = Math.max(2, windowSize);
    if (len < windowSize) return { points: [], step: 1, windowSize: windowSize };

    var totalWindows = len - windowSize + 1;
    var step = Math.max(1, Math.ceil(totalWindows / MAX_CHART_POINTS));
    var points = [];
    for (var i = 0; i <= len - windowSize; i += step) {
      var gc = 0;
      for (var j = i; j < i + windowSize; j++) {
        var u = seq[j].toUpperCase();
        if (u === 'G' || u === 'C') gc++;
      }
      points.push({ pos: i + Math.floor(windowSize / 2) + 1, gcPct: (gc / windowSize) * 100 });
    }
    return { points: points, step: step, windowSize: windowSize };
  }

  // ---- Formatting -------------------------------------------------------

  function formatPct(x) { return x.toFixed(1) + '%'; }
  function formatSkew(x) {
    var v = x.toFixed(3);
    if (x > 0) v = '+' + v;
    return v;
  }
  function truncateName(name, max) {
    if (!name) return '';
    return name.length > max ? name.slice(0, max - 1) + '…' : name;
  }

  // ---- Chart drawing -----------------------------------------------------

  function drawChart(canvas, points, avgGc, seqLen) {
    var wrap = canvas.parentNode;
    var dpr = window.devicePixelRatio || 1;
    var cssWidth = Math.max(240, wrap.clientWidth);
    var cssHeight = 220;

    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.width = '100%';
    canvas.style.height = cssHeight + 'px';

    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    var padL = 42, padR = 12, padT = 12, padB = 24;
    var plotW = cssWidth - padL - padR;
    var plotH = cssHeight - padT - padB;

    ctx.font = '11px -apple-system, sans-serif';

    // gridlines + y-axis labels
    ctx.strokeStyle = '#e1e8e6';
    ctx.fillStyle = '#5b6b67';
    ctx.lineWidth = 1;
    [0, 25, 50, 75, 100].forEach(function (v) {
      var y = padT + plotH - (v / 100) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillText(v + '%', 4, y + 4);
    });

    // average GC reference line
    if (points.length > 0) {
      ctx.strokeStyle = '#c0392b';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      var avgY = padT + plotH - (Math.min(100, Math.max(0, avgGc)) / 100) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, avgY);
      ctx.lineTo(padL + plotW, avgY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // data line
    if (points.length > 1) {
      ctx.strokeStyle = '#0f7a5c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach(function (p, idx) {
        var x = padL + (p.pos / seqLen) * plotW;
        var y = padT + plotH - (Math.min(100, Math.max(0, p.gcPct)) / 100) * plotH;
        if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    } else if (points.length === 1) {
      var p0 = points[0];
      var x0 = padL + (p0.pos / seqLen) * plotW;
      var y0 = padT + plotH - (Math.min(100, Math.max(0, p0.gcPct)) / 100) * plotH;
      ctx.fillStyle = '#0f7a5c';
      ctx.beginPath();
      ctx.arc(x0, y0, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // x-axis labels
    ctx.fillStyle = '#5b6b67';
    ctx.fillText('1', padL, cssHeight - 6);
    var endLabel = String(seqLen);
    var endWidth = ctx.measureText(endLabel).width;
    ctx.fillText(endLabel, padL + plotW - endWidth, cssHeight - 6);
  }

  // ---- Main init -----------------------------------------------------

  function init(root) {
    var input = root.querySelector('[data-role="input"]');
    var btnSample = root.querySelector('[data-role="sample"]');
    var btnClear = root.querySelector('[data-role="clear"]');
    var windowSizeInput = root.querySelector('[data-role="window-size"]');
    var windowValue = root.querySelector('[data-role="window-value"]');
    var recordSelectWrap = root.querySelector('[data-role="record-select-wrap"]');
    var recordSelect = root.querySelector('[data-role="record-select"]');
    var statLength = root.querySelector('[data-role="stat-length"]');
    var statGc = root.querySelector('[data-role="stat-gc"]');
    var statAt = root.querySelector('[data-role="stat-at"]');
    var statGcSkew = root.querySelector('[data-role="stat-gcskew"]');
    var statAtSkew = root.querySelector('[data-role="stat-atskew"]');
    var compBar = root.querySelector('[data-role="comp-bar"]');
    var compLegend = root.querySelector('[data-role="comp-legend"]');
    var canvas = root.querySelector('[data-role="chart"]');
    var chartPlaceholder = root.querySelector('[data-role="chart-placeholder"]');
    var chartNote = root.querySelector('[data-role="chart-note"]');
    var multiWrap = root.querySelector('[data-role="multi-wrap"]');
    var multiTbody = root.querySelector('[data-role="multi-tbody"]');
    var btnCopy = root.querySelector('[data-role="copy"]');
    var btnDownload = root.querySelector('[data-role="download"]');

    var isEn = root.getAttribute('data-i18n') === 'en';
    var i18n = isEn
      ? {
          copied: 'Report copied to clipboard',
          cleared: 'Cleared',
          noInput: 'Paste a sequence first',
          unnamed: 'Sequence',
          tooShort: 'Sequence is shorter than the window size — no chart to show.',
          sampled: function (step) { return step > 1 ? ' (down-sampled every ' + step + ' bp to keep the chart readable)' : ''; },
          reportTitle: 'BioOnSun GC Content Report',
          generated: 'Generated',
          totalRecords: 'Total sequences',
          perRecord: 'Per-sequence summary',
          selectedDetail: 'Selected sequence detail',
          length: 'Length',
          gcContent: 'GC content',
          atContent: 'AT content',
          gcSkew: 'GC skew',
          atSkew: 'AT skew',
          windowSize: 'Sliding window size',
          composition: 'Base composition'
        }
      : {
          copied: '리포트를 클립보드에 복사했습니다',
          cleared: '초기화했습니다',
          noInput: '먼저 서열을 입력해주세요',
          unnamed: '서열',
          tooShort: '서열이 윈도우 크기보다 짧아 그래프를 표시할 수 없습니다.',
          sampled: function (step) { return step > 1 ? ' (그래프 표시를 위해 ' + step + 'bp 간격으로 샘플링됨)' : ''; },
          reportTitle: 'BioOnSun GC 함량 계산기 결과',
          generated: '생성 시각',
          totalRecords: '전체 서열 개수',
          perRecord: '서열별 요약',
          selectedDetail: '선택된 서열 상세',
          length: '길이',
          gcContent: 'GC 함량',
          atContent: 'AT 함량',
          gcSkew: 'GC skew',
          atSkew: 'AT skew',
          windowSize: '슬라이딩 윈도우 크기',
          composition: '염기 조성'
        };

    var sampleSeq = root.getAttribute('data-sample') || '';

    var state = { records: [], selectedIndex: 0 };

    function recordLabel(rec, idx) {
      return rec.header ? truncateName(rec.header, 42) : i18n.unnamed + ' ' + (idx + 1);
    }

    function renderCompBar(comp) {
      compBar.innerHTML = '';
      compLegend.innerHTML = '';
      if (!comp.length) return;
      var segments = [
        { key: 'G', label: 'G', pct: comp.length ? (comp.counts.G / comp.length) * 100 : 0 },
        { key: 'C', label: 'C', pct: comp.length ? (comp.counts.C / comp.length) * 100 : 0 },
        { key: 'A', label: 'A', pct: comp.length ? (comp.counts.A / comp.length) * 100 : 0 },
        { key: 'T', label: 'T/U', pct: comp.length ? ((comp.counts.T + comp.counts.U) / comp.length) * 100 : 0 },
        { key: 'N', label: 'N', pct: comp.nPct },
        { key: 'other', label: isEn ? 'Other (ambiguity codes)' : '기타 (모호성 코드)', pct: comp.otherPct }
      ];
      segments.forEach(function (seg) {
        if (seg.pct <= 0) return;
        var span = document.createElement('span');
        span.style.width = seg.pct + '%';
        span.style.background = BASE_COLORS[seg.key];
        span.title = seg.label + ': ' + formatPct(seg.pct);
        compBar.appendChild(span);

        var legendItem = document.createElement('span');
        var dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = BASE_COLORS[seg.key];
        legendItem.appendChild(dot);
        legendItem.appendChild(document.createTextNode(seg.label + ' ' + formatPct(seg.pct)));
        compLegend.appendChild(legendItem);
      });
    }

    function renderMultiTable() {
      if (state.records.length < 2) {
        multiWrap.hidden = true;
        return;
      }
      multiWrap.hidden = false;
      multiTbody.innerHTML = '';
      state.records.forEach(function (rec, idx) {
        var comp = computeComposition(rec.seq);
        var tr = document.createElement('tr');
        if (idx === state.selectedIndex) tr.className = 'active-row';
        var cells = [
          recordLabel(rec, idx),
          comp.length.toLocaleString(),
          formatPct(comp.gcPct),
          formatPct(comp.atPct),
          formatSkew(comp.gcSkew)
        ];
        cells.forEach(function (text) {
          var td = document.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        });
        tr.addEventListener('click', function () {
          state.selectedIndex = idx;
          if (recordSelect) recordSelect.value = String(idx);
          render();
        });
        tr.style.cursor = 'pointer';
        multiTbody.appendChild(tr);
      });
    }

    function renderRecordSelect() {
      if (state.records.length < 2) {
        recordSelectWrap.hidden = true;
        return;
      }
      recordSelectWrap.hidden = false;
      recordSelect.innerHTML = '';
      state.records.forEach(function (rec, idx) {
        var opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = recordLabel(rec, idx);
        recordSelect.appendChild(opt);
      });
      recordSelect.value = String(state.selectedIndex);
    }

    function render() {
      var windowSize = parseInt(windowSizeInput.value, 10) || 50;
      windowValue.textContent = windowSize;

      renderRecordSelect();
      renderMultiTable();

      if (state.records.length === 0) {
        statLength.textContent = '0';
        statGc.textContent = '--';
        statAt.textContent = '--';
        statGcSkew.textContent = '--';
        statAtSkew.textContent = '--';
        compBar.innerHTML = '';
        compLegend.innerHTML = '';
        canvas.hidden = true;
        chartPlaceholder.hidden = false;
        chartPlaceholder.textContent = chartPlaceholder.getAttribute('data-default-text') || chartPlaceholder.textContent;
        if (chartNote) chartNote.textContent = '';
        return;
      }

      if (state.selectedIndex >= state.records.length) state.selectedIndex = 0;
      var rec = state.records[state.selectedIndex];
      var comp = computeComposition(rec.seq);

      statLength.textContent = comp.length.toLocaleString();
      statGc.textContent = formatPct(comp.gcPct);
      statAt.textContent = formatPct(comp.atPct);
      statGcSkew.textContent = formatSkew(comp.gcSkew);
      statAtSkew.textContent = formatSkew(comp.atSkew);

      renderCompBar(comp);

      var windowResult = slidingWindowGC(rec.seq, windowSize);
      if (windowResult.points.length === 0) {
        canvas.hidden = true;
        chartPlaceholder.hidden = false;
        chartPlaceholder.textContent = i18n.tooShort;
        if (chartNote) chartNote.textContent = '';
      } else {
        canvas.hidden = false;
        chartPlaceholder.hidden = true;
        drawChart(canvas, windowResult.points, comp.gcPct, comp.length);
        if (chartNote) {
          chartNote.textContent = (isEn
            ? 'Window: ' + windowResult.windowSize + ' bp · dashed line = overall average GC%'
            : '윈도우: ' + windowResult.windowSize + 'bp · 점선 = 전체 평균 GC 함량') + i18n.sampled(windowResult.step);
        }
      }
    }

    function buildReport() {
      var lines = [];
      lines.push(i18n.reportTitle);
      lines.push(i18n.generated + ': ' + new Date().toLocaleString());
      lines.push(i18n.totalRecords + ': ' + state.records.length);
      lines.push('');
      lines.push('[' + i18n.perRecord + ']');
      state.records.forEach(function (rec, idx) {
        var comp = computeComposition(rec.seq);
        lines.push(
          (idx + 1) + '. ' + recordLabel(rec, idx) +
          ' | ' + i18n.length + ': ' + comp.length + ' nt' +
          ' | ' + i18n.gcContent + ': ' + formatPct(comp.gcPct) +
          ' | ' + i18n.atContent + ': ' + formatPct(comp.atPct) +
          ' | ' + i18n.gcSkew + ': ' + formatSkew(comp.gcSkew) +
          ' | ' + i18n.atSkew + ': ' + formatSkew(comp.atSkew)
        );
      });

      if (state.records.length > 0) {
        var sel = state.records[state.selectedIndex];
        var selComp = computeComposition(sel.seq);
        lines.push('');
        lines.push('[' + i18n.selectedDetail + ': ' + recordLabel(sel, state.selectedIndex) + ']');
        lines.push(i18n.length + ': ' + selComp.length + ' nt');
        lines.push(
          i18n.composition + ' — A: ' + selComp.counts.A +
          ', T/U: ' + (selComp.counts.T + selComp.counts.U) +
          ', G: ' + selComp.counts.G +
          ', C: ' + selComp.counts.C +
          ', N: ' + selComp.counts.N +
          ', ' + (isEn ? 'other' : '기타') + ': ' + selComp.counts.other
        );
        lines.push(i18n.gcContent + ': ' + formatPct(selComp.gcPct));
        lines.push(i18n.atContent + ': ' + formatPct(selComp.atPct));
        lines.push(i18n.gcSkew + ': ' + formatSkew(selComp.gcSkew) + '  ((G-C)/(G+C))');
        lines.push(i18n.atSkew + ': ' + formatSkew(selComp.atSkew) + '  ((A-T)/(A+T))');
        lines.push(i18n.windowSize + ': ' + (parseInt(windowSizeInput.value, 10) || 50) + ' nt');
      }
      return lines.join('\n');
    }

    input.addEventListener('input', function () {
      state.records = parseRecords(input.value);
      state.selectedIndex = 0;
      render();
    });

    windowSizeInput.addEventListener('input', render);

    if (recordSelect) {
      recordSelect.addEventListener('change', function () {
        state.selectedIndex = parseInt(recordSelect.value, 10) || 0;
        render();
      });
    }

    if (btnSample) {
      btnSample.addEventListener('click', function () {
        input.value = sampleSeq;
        state.records = parseRecords(input.value);
        state.selectedIndex = 0;
        render();
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', function () {
        input.value = '';
        state.records = [];
        state.selectedIndex = 0;
        render();
        window.BioOnSun.toast(i18n.cleared);
        input.focus();
      });
    }

    if (btnCopy) {
      btnCopy.addEventListener('click', function () {
        if (state.records.length === 0) { window.BioOnSun.toast(i18n.noInput); return; }
        window.BioOnSun.copyText(buildReport(), i18n.copied);
      });
    }

    if (btnDownload) {
      btnDownload.addEventListener('click', function () {
        if (state.records.length === 0) { window.BioOnSun.toast(i18n.noInput); return; }
        window.BioOnSun.download('gc-content-report.txt', buildReport());
      });
    }

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (state.records.length > 0) render();
      }, 150);
    });

    if (chartPlaceholder) {
      chartPlaceholder.setAttribute('data-default-text', chartPlaceholder.textContent);
    }

    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-tool="gc-content"]').forEach(init);
  });

  // exposed for potential unit testing
  window.BioOnSunGcContent = {
    parseRecords: parseRecords,
    computeComposition: computeComposition,
    slidingWindowGC: slidingWindowGC
  };
})();
