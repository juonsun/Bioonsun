// BioOnSun — Blog admin (write) tool.
// Runs entirely in the browser. No server, no database: this page reads the
// site's own current /blog/posts.json over fetch, lets you compose a new
// post, and packages a ready-to-deploy zip (new post pages + regenerated
// index/tag pages/posts.json + sitemap additions) for you to unzip into the
// local repo and `git push`.
//
// IMPORTANT — this password gate is NOT real security. Anyone who reads this
// file's source can see (or brute-force) the hash below. It only exists to
// stop accidental visitors from opening the form. Real privacy comes from
// keeping this page's URL out of the sitemap/nav (already done) and out of
// robots.txt-indexable paths. Change ADMIN_PASSWORD_HASH before you rely on
// this at all — see the on-page instructions for how.
(function () {
  'use strict';

  var ADMIN_PASSWORD_HASH = 'b0a59f7fc1d463acda5d6fac95fbf6453b07e1f337c7ef4db7d33c6ba7e6f52f'; // sha256("bioonsun2026")

  var BT = window.BlogTemplates;

  async function sha256Hex(text) {
    var enc = new TextEncoder().encode(text);
    var buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  // ------------------------------------------------------------------
  // Password gate
  // ------------------------------------------------------------------

  function initGate() {
    var gate = document.getElementById('adminGate');
    var app = document.getElementById('adminApp');
    var input = document.getElementById('adminPassword');
    var btn = document.getElementById('adminUnlockBtn');
    var err = document.getElementById('adminGateError');

    async function tryUnlock() {
      var hash = await sha256Hex(input.value || '');
      if (hash === ADMIN_PASSWORD_HASH) {
        gate.style.display = 'none';
        app.style.display = '';
        sessionStorage.setItem('bos_admin_ok', '1');
      } else {
        err.textContent = '비밀번호가 올바르지 않습니다.';
        input.value = '';
        input.focus();
      }
    }

    btn.addEventListener('click', tryUnlock);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tryUnlock();
    });

    if (sessionStorage.getItem('bos_admin_ok') === '1') {
      gate.style.display = 'none';
      app.style.display = '';
    } else {
      input.focus();
    }
  }

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  var state = {
    posts: [],          // loaded from /bioonsun/blog/posts.json
    postsLoaded: false,
    images: []           // { id, file, filename, url } — added via the image picker, packaged into the zip on generate
  };

  var MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB per image
  var imageIdCounter = 0;

  function el(id) { return document.getElementById(id); }

  function markdownToHtml(md) {
    var raw = window.marked ? window.marked.parse(md || '') : '<p>' + BT.htmlEscape(md || '') + '</p>';
    return BT.applyCallouts(raw);
  }

  function parseTags(raw) {
    return (raw || '')
      .split(/[,#]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function slugSuggestion() {
    var enTitle = el('fieldTitleEn').value.trim();
    var koTitle = el('fieldTitleKo').value.trim();
    return BT.slugify(enTitle || koTitle, 'post');
  }

  // ------------------------------------------------------------------
  // Loading existing posts.json
  // ------------------------------------------------------------------

  async function loadPosts() {
    var status = el('loadStatus');
    status.className = 'admin-status';
    status.textContent = '불러오는 중...';
    try {
      var res = await fetch('/bioonsun/blog/posts.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      state.posts = Array.isArray(data.posts) ? data.posts : [];
      state.postsLoaded = true;
      status.className = 'admin-status ok';
      status.textContent = '기존 글 ' + state.posts.length + '개를 불러왔습니다.';
    } catch (e) {
      state.posts = [];
      state.postsLoaded = false;
      status.className = 'admin-status err';
      status.textContent = '자동으로 불러오지 못했습니다 (' + e.message + '). 아래에서 posts.json 파일을 직접 선택해 주세요. 신규 사이트라면 무시해도 됩니다 (글 0개로 시작).';
    }
    renderExistingList();
  }

  function handlePostsFileUpload(evt) {
    var file = evt.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        state.posts = Array.isArray(data.posts) ? data.posts : [];
        state.postsLoaded = true;
        var status = el('loadStatus');
        status.className = 'admin-status ok';
        status.textContent = '파일에서 기존 글 ' + state.posts.length + '개를 불러왔습니다.';
        renderExistingList();
      } catch (e) {
        alert('posts.json 파싱 실패: ' + e.message);
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function renderExistingList() {
    var box = el('existingList');
    if (!state.posts.length) {
      box.innerHTML = '<p class="admin-hint">불러온 기존 글이 없습니다 (신규 블로그이거나, 아직 불러오지 않았습니다).</p>';
      return;
    }
    var rows = state.posts
      .slice()
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; })
      .map(function (p) {
        return '<li class="existing-row">' +
          '<span class="existing-info"><code>' + BT.htmlEscape(p.slug) + '</code> — ' + BT.htmlEscape(p.date) + ' — ' + BT.htmlEscape((p.ko && p.ko.title) || '') + '</span>' +
          '<span class="existing-actions">' +
          '<button type="button" class="btn btn-sm" data-existing-action="load" data-slug="' + BT.htmlEscape(p.slug) + '">불러오기</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" data-existing-action="delete" data-slug="' + BT.htmlEscape(p.slug) + '">삭제</button>' +
          '</span>' +
          '</li>';
      });
    box.innerHTML = '<ul class="orf-list">' + rows.join('') + '</ul>';
  }

  function findPost(slug) {
    var found = null;
    state.posts.forEach(function (p) { if (p.slug === slug) found = p; });
    return found;
  }

  function loadPostForEdit(slug) {
    var post = findPost(slug);
    if (!post) return;
    el('fieldTitleKo').value = (post.ko && post.ko.title) || '';
    el('fieldTitleEn').value = (post.en && post.en.title) || '';
    el('fieldSlug').value = post.slug;
    el('fieldSlug').dataset.userEdited = '1'; // don't let title input overwrite the slug we're editing
    el('fieldDate').value = post.date || '';
    el('fieldTags').value = (post.tags || []).join(', ');
    el('fieldExcerptKo').value = (post.ko && post.ko.excerpt) || '';
    el('fieldExcerptEn').value = (post.en && post.en.excerpt) || '';

    var hasBodyKo = !!(post.ko && typeof post.ko.body === 'string' && post.ko.body);
    var hasBodyEn = !!(post.en && typeof post.en.body === 'string' && post.en.body);
    el('fieldBodyKo').value = hasBodyKo ? post.ko.body : '';
    el('fieldBodyEn').value = hasBodyEn ? post.en.body : '';

    updatePreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    var status = el('loadStatus');
    var label = (post.ko && post.ko.title) || post.slug;
    if (hasBodyKo && hasBodyEn) {
      status.className = 'admin-status ok';
      status.textContent = '"' + label + '" 글을 불러왔습니다. 수정한 뒤 zip을 생성하면 같은 글이 갱신됩니다.';
    } else {
      status.className = 'admin-status err';
      status.textContent = '"' + label + '"의 메타데이터만 불러왔습니다 — 이 글은 본문 원본이 저장되어 있지 않아(이미지 업로드 기능 추가 이전에 작성된 글) 본문을 새로 입력해야 합니다. 그 전까지 저장된 사이트에 있는 글 내용을 참고해서 다시 옮겨 적어주세요.';
    }
  }

  function buildUpdatedNotes(date) {
    return {
      ko: '최종 업데이트: ' + date.slice(0, 4) + '년 ' + parseInt(date.slice(5, 7), 10) + '월',
      en: 'Last updated: ' + date
    };
  }

  function urlsForSegPair(baseHost, koSeg, enSeg) {
    return [baseHost + '/bioonsun' + buildSitemapPath(koSeg), baseHost + '/bioonsun' + buildSitemapPath(enSeg)];
  }

  function removeSitemapUrls(xmlText, locs) {
    var text = xmlText;
    locs.forEach(function (loc) {
      var escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('\\s*<url>\\s*<loc>' + escaped + '</loc>[\\s\\S]*?</url>\\s*', 'g');
      text = text.replace(re, '\n');
    });
    return text;
  }

  async function deletePost(slug) {
    var post = findPost(slug);
    if (!post) return;
    var title = (post.ko && post.ko.title) || slug;
    var confirmed = confirm(
      '"' + title + '" (' + slug + ') 글을 삭제하시겠습니까?\n\n' +
      '삭제용 zip이 생성됩니다. 압축을 풀어 저장소에 덮어쓰고, zip 안의 README-delete.txt에 안내된 파일 몇 개는 ' +
      '탐색기에서 직접 삭제한 뒤 git push 해야 실제로 사라집니다.'
    );
    if (!confirmed) return;

    var status = el('loadStatus');
    status.className = 'admin-status';
    status.textContent = '삭제용 zip 생성 중...';

    var remainingPosts = state.posts.filter(function (p) { return p.slug !== slug; });
    var today = new Date().toISOString().slice(0, 10);
    var notes = buildUpdatedNotes(today);
    var zip = new JSZip();

    zip.file('blog/index.html', BT.renderIndexPage({ lang: 'ko', posts: remainingPosts, updatedNote: notes.ko }));
    zip.file('en/blog/index.html', BT.renderIndexPage({ lang: 'en', posts: remainingPosts, updatedNote: notes.en }));

    var remainingTags = BT.uniqueTags(remainingPosts);
    remainingTags.forEach(function (t) {
      var postsForTag = remainingPosts.filter(function (p) { return (p.tags || []).some(function (tg) { return BT.slugify(tg, 'tag') === t.slug; }); });
      zip.file('blog/tag/' + t.slug + '.html', BT.renderTagPage({ lang: 'ko', tag: t.tag, tagSlug: t.slug, posts: postsForTag, updatedNote: notes.ko }));
      zip.file('en/blog/tag/' + t.slug + '.html', BT.renderTagPage({ lang: 'en', tag: t.tag, tagSlug: t.slug, posts: postsForTag, updatedNote: notes.en }));
    });

    zip.file('blog/posts.json', JSON.stringify({ posts: remainingPosts }, null, 2) + '\n');

    // Tags that only this post used no longer have any page linking to them.
    var remainingTagSlugs = remainingTags.map(function (t) { return t.slug; });
    var orphanedTags = (post.tags || []).filter(function (tag) {
      return remainingTagSlugs.indexOf(BT.slugify(tag, 'tag')) === -1;
    });

    var segPairsToRemove = [
      [BT.pageSegments('ko', ['blog', slug + '.html']), BT.pageSegments('en', ['blog', slug + '.html'])]
    ];
    orphanedTags.forEach(function (tag) {
      var tslug = BT.slugify(tag, 'tag');
      segPairsToRemove.push([BT.pageSegments('ko', ['blog', 'tag', tslug + '.html']), BT.pageSegments('en', ['blog', 'tag', tslug + '.html'])]);
    });

    var rootXml = await fetchTextOrNull('/sitemap.xml');
    var bioonsunXml = await fetchTextOrNull('/bioonsun/sitemap.xml');
    var plainRemoveList = [];

    [{ key: 'sitemap.xml', xml: rootXml, fallbackHost: 'https://juonsun.com' },
     { key: 'bioonsun/sitemap.xml', xml: bioonsunXml, fallbackHost: 'https://www.juonsun.com' }].forEach(function (entry) {
      if (!entry.xml) return;
      var host = detectHost(entry.xml, entry.fallbackHost);
      var locs = [];
      segPairsToRemove.forEach(function (pair) {
        urlsForSegPair(host, pair[0], pair[1]).forEach(function (u) { locs.push(u); });
      });
      zip.file(entry.key, removeSitemapUrls(entry.xml, locs));
    });

    segPairsToRemove.forEach(function (pair) {
      plainRemoveList.push('https://juonsun.com/bioonsun' + buildSitemapPath(pair[0]));
      plainRemoveList.push('https://juonsun.com/bioonsun' + buildSitemapPath(pair[1]));
    });
    zip.file('sitemap-removed-urls.txt',
      'sitemap.xml에서 아래 URL을 자동으로 제거 시도했습니다 (fetch 성공 시). 실패했거나 확인하고 싶다면 아래 URL이\n' +
      'sitemap.xml / bioonsun/sitemap.xml에서 빠졌는지 직접 확인하세요:\n\n' +
      plainRemoveList.join('\n') + '\n');

    var manualDeleteLines = [
      '  bioonsun\\blog\\' + slug + '.html',
      '  bioonsun\\en\\blog\\' + slug + '.html',
      '  bioonsun\\blog\\images\\' + slug + '\\  (이 글에 이미지가 있었다면 폴더째로)'
    ];
    orphanedTags.forEach(function (tag) {
      var tslug = BT.slugify(tag, 'tag');
      manualDeleteLines.push('  bioonsun\\blog\\tag\\' + tslug + '.html  (이 태그를 쓰던 글이 더 이상 없음)');
      manualDeleteLines.push('  bioonsun\\en\\blog\\tag\\' + tslug + '.html');
    });

    var readme =
      'BioOnSun 블로그 글 삭제 안내\n' +
      '============================\n\n' +
      '1. 이 zip을 압축 해제합니다.\n' +
      '2. 압축을 푼 폴더 안의 내용을 로컬 저장소의 bioonsun 폴더 위에 그대로 덮어씁니다.\n' +
      '   (...\\Bioonsun\\bioonsun\\ 위에 blog/, en/blog/ 폴더와 bioonsun/sitemap.xml 덮어쓰기,\n' +
      '   이 zip의 sitemap.xml은 저장소 루트 Bioonsun\\sitemap.xml에 덮어쓰기)\n' +
      '3. 브라우저는 파일을 삭제할 수 없어서, 아래 파일/폴더는 탐색기에서 직접 삭제해야 합니다:\n' +
      manualDeleteLines.join('\n') + '\n' +
      '4. 평소처럼 git add / git commit / git push origin main 을 실행합니다.\n\n' +
      '삭제된 글: ' + slug + ' (' + title + ')\n';
    zip.file('README-delete.txt', readme);

    var blob = await zip.generateAsync({ type: 'blob' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'bioonsun-blog-delete-' + slug + '.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);

    state.posts = remainingPosts;
    renderExistingList();
    status.className = 'admin-status ok';
    status.textContent = '"' + title + '" 삭제용 zip을 생성했습니다 (README-delete.txt 안내를 따라 마무리하세요).';
  }

  function handleExistingListClick(evt) {
    var box = el('existingList');
    var t = evt.target;
    while (t && t !== box && !(t.dataset && t.dataset.existingAction)) t = t.parentNode;
    if (!t || t === box) return;
    var slug = t.dataset.slug;
    var action = t.dataset.existingAction;
    if (action === 'load') loadPostForEdit(slug);
    else if (action === 'delete') deletePost(slug);
  }

  // ------------------------------------------------------------------
  // Images — picked in the browser, inserted into the markdown body as a
  // relative path, and packaged into the generated zip under
  // blog/images/{slug}/{filename} (see generateAndDownload). Nothing is
  // uploaded anywhere; the file stays in memory until you download the zip.
  // ------------------------------------------------------------------

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  // Keeps the extension, runs the base name through the same slugify used
  // for post/tag slugs (Hangul-safe) so it's a clean, URL-safe filename.
  function sanitizeImageFilename(name) {
    var raw = name || 'image';
    var dot = raw.lastIndexOf('.');
    var base = dot > 0 ? raw.slice(0, dot) : raw;
    var ext = dot > 0 ? raw.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : '';
    if (!ext) ext = '.img';
    return BT.slugify(base, 'image') + ext;
  }

  function uniqueImageFilename(filename) {
    var used = state.images.map(function (i) { return i.filename; });
    if (used.indexOf(filename) === -1) return filename;
    var dot = filename.lastIndexOf('.');
    var base = dot > 0 ? filename.slice(0, dot) : filename;
    var ext = dot > 0 ? filename.slice(dot) : '';
    var n = 2;
    var candidate;
    do {
      candidate = base + '-' + n + ext;
      n++;
    } while (used.indexOf(candidate) !== -1);
    return candidate;
  }

  function handleImageFilesChange(evt) {
    var files = Array.prototype.slice.call(evt.target.files || []);
    var skipped = [];
    files.forEach(function (file) {
      if (!/^image\//.test(file.type)) { skipped.push(file.name + ' (이미지 파일이 아닙니다)'); return; }
      if (file.size > MAX_IMAGE_BYTES) { skipped.push(file.name + ' (8MB 초과)'); return; }
      var filename = uniqueImageFilename(sanitizeImageFilename(file.name));
      state.images.push({
        id: 'img' + (imageIdCounter++),
        file: file,
        filename: filename,
        url: URL.createObjectURL(file)
      });
    });
    evt.target.value = ''; // allow re-adding the same file later if removed
    renderImageList();
    if (skipped.length) {
      alert('다음 파일은 추가되지 않았습니다:\n' + skipped.join('\n'));
    }
  }

  function renderImageList() {
    var box = el('imageList');
    if (!state.images.length) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = state.images.map(function (img) {
      return '<div class="admin-image-row">' +
        '<img class="admin-image-thumb" src="' + img.url + '" alt="">' +
        '<div class="admin-image-info">' +
        '<div class="admin-image-name">' + BT.htmlEscape(img.filename) + '</div>' +
        '<div class="admin-image-size">' + formatBytes(img.file.size) + '</div>' +
        '</div>' +
        '<div class="admin-image-actions">' +
        '<button type="button" class="btn btn-sm" data-action="insert-ko" data-id="' + img.id + '">KO 본문에 삽입</button>' +
        '<button type="button" class="btn btn-sm" data-action="insert-en" data-id="' + img.id + '">EN 본문에 삽입</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-action="remove" data-id="' + img.id + '">삭제</button>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  function removeImage(id) {
    var idx = -1;
    state.images.forEach(function (img, i) { if (img.id === id) idx = i; });
    if (idx === -1) return;
    URL.revokeObjectURL(state.images[idx].url);
    state.images.splice(idx, 1);
    renderImageList();
  }

  function insertTextAtCursor(textarea, text) {
    var start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : textarea.value.length;
    var end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : start;
    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    var newPos = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = newPos;
  }

  function insertImageIntoBody(id, lang) {
    var slug = el('fieldSlug').value.trim();
    if (!slug || !/^[a-z0-9\-]+$/i.test(slug)) {
      alert('먼저 슬러그(영문/숫자/하이픈)를 입력하세요. 이미지 경로가 슬러그를 기준으로 만들어집니다.');
      return;
    }
    var img = null;
    state.images.forEach(function (i) { if (i.id === id) img = i; });
    if (!img) return;
    var relPath = BT.relFrom(BT.pageSegments(lang, ['blog']), ['blog', 'images', slug, img.filename]);
    var altBase = img.filename.replace(/\.[^.]+$/, '').replace(/-/g, ' ');
    var snippet = '\n\n![' + altBase + '](' + relPath + ')\n\n';
    var textarea = el(lang === 'ko' ? 'fieldBodyKo' : 'fieldBodyEn');
    textarea.focus();
    insertTextAtCursor(textarea, snippet);
    updatePreview();
  }

  function handleImageListClick(evt) {
    var box = el('imageList');
    var t = evt.target;
    while (t && t !== box && !(t.dataset && t.dataset.action)) t = t.parentNode;
    if (!t || t === box) return;
    var id = t.dataset.id;
    var action = t.dataset.action;
    if (action === 'remove') removeImage(id);
    else if (action === 'insert-ko') insertImageIntoBody(id, 'ko');
    else if (action === 'insert-en') insertImageIntoBody(id, 'en');
  }

  // ------------------------------------------------------------------
  // Preview
  // ------------------------------------------------------------------

  function updatePreview() {
    var lang = document.querySelector('input[name="previewLang"]:checked').value;
    var titleEl = el(lang === 'ko' ? 'fieldTitleKo' : 'fieldTitleEn');
    var bodyEl = el(lang === 'ko' ? 'fieldBodyKo' : 'fieldBodyEn');
    var tags = parseTags(el('fieldTags').value);

    var html = '<h1 style="font-size:1.3rem;">' + BT.htmlEscape(titleEl.value || '(제목 없음)') + '</h1>';
    if (tags.length) {
      html += '<div class="tag-chip-list">' + tags.map(function (t) {
        return '<span class="tag-chip is-static">#' + BT.htmlEscape(t) + '</span>';
      }).join('') + '</div>';
    }
    html += '<div class="post-body">' + markdownToHtml(bodyEl.value) + '</div>';
    el('previewBox').innerHTML = html;
  }

  // ------------------------------------------------------------------
  // Generate & package
  // ------------------------------------------------------------------

  function validate() {
    var errors = [];
    var titleKo = el('fieldTitleKo').value.trim();
    var titleEn = el('fieldTitleEn').value.trim();
    var slug = el('fieldSlug').value.trim();
    var date = el('fieldDate').value.trim();
    var bodyKo = el('fieldBodyKo').value.trim();
    var bodyEn = el('fieldBodyEn').value.trim();

    if (!titleKo) errors.push('한국어 제목을 입력하세요.');
    if (!titleEn) errors.push('영어 제목을 입력하세요.');
    if (!slug || !/^[a-z0-9\-]+$/i.test(slug)) errors.push('슬러그는 영문/숫자/하이픈(-)만 사용할 수 있습니다.');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('날짜를 선택하세요.');
    if (!bodyKo) errors.push('한국어 본문을 입력하세요.');
    if (!bodyEn) errors.push('영어 본문을 입력하세요.');
    return errors;
  }

  function mergePost(newPost) {
    var idx = state.posts.findIndex(function (p) { return p.slug === newPost.slug; });
    var merged = state.posts.slice();
    if (idx >= 0) {
      merged[idx] = newPost;
    } else {
      merged.push(newPost);
    }
    return merged;
  }

  function buildSitemapPath(segments) {
    var full = BT.canonicalUrl(segments); // https://juonsun.com/bioonsun/...
    return full.replace(BT.SITE_BASE, ''); // '/blog/' or '/blog/x.html'
  }

  function sitemapUrlBlock(baseHost, koSeg, enSeg) {
    var koUrl = baseHost + '/bioonsun' + buildSitemapPath(koSeg);
    var enUrl = baseHost + '/bioonsun' + buildSitemapPath(enSeg);
    function block(loc) {
      return '  <url>\n' +
        '    <loc>' + loc + '</loc>\n' +
        '    <xhtml:link rel="alternate" hreflang="ko" href="' + koUrl + '"/>\n' +
        '    <xhtml:link rel="alternate" hreflang="en" href="' + enUrl + '"/>\n' +
        '    <xhtml:link rel="alternate" hreflang="x-default" href="' + enUrl + '"/>\n' +
        '  </url>';
    }
    return [block(koUrl), block(enUrl)];
  }

  function detectHost(xmlText, fallback) {
    var m = /<loc>(https?:\/\/[^\/]+)/.exec(xmlText || '');
    return m ? m[1] : fallback;
  }

  function mergeSitemapXml(xmlText, baseHost, urlBlocks) {
    var text = xmlText;
    urlBlocks.forEach(function (block) {
      var locMatch = /<loc>([^<]+)<\/loc>/.exec(block);
      var loc = locMatch ? locMatch[1] : null;
      if (loc && text.indexOf('<loc>' + loc + '</loc>') !== -1) return; // already present
      text = text.replace(/<\/urlset>\s*$/, block + '\n\n</urlset>\n');
    });
    return text;
  }

  async function fetchTextOrNull(url) {
    try {
      var res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.text();
    } catch (e) {
      return null;
    }
  }

  async function generateAndDownload() {
    var status = el('generateStatus');
    var errors = validate();
    if (errors.length) {
      status.className = 'admin-status err';
      status.innerHTML = errors.map(BT.htmlEscape).join('<br>');
      return;
    }

    status.className = 'admin-status';
    status.textContent = '생성 중...';

    var slug = el('fieldSlug').value.trim();
    var date = el('fieldDate').value.trim();
    var tags = parseTags(el('fieldTags').value);
    var notes = buildUpdatedNotes(date);
    var updatedNoteKo = notes.ko;
    var updatedNoteEn = notes.en;
    var rawBodyKo = el('fieldBodyKo').value;
    var rawBodyEn = el('fieldBodyEn').value;

    var newPost = {
      slug: slug,
      date: date,
      tags: tags,
      ko: {
        title: el('fieldTitleKo').value.trim(),
        excerpt: el('fieldExcerptKo').value.trim(),
        body: rawBodyKo // raw markdown, kept so "불러오기" can load it back for editing later
      },
      en: {
        title: el('fieldTitleEn').value.trim(),
        excerpt: el('fieldExcerptEn').value.trim(),
        body: rawBodyEn
      }
    };
    var bodyHtmlKo = markdownToHtml(rawBodyKo);
    var bodyHtmlEn = markdownToHtml(rawBodyEn);

    var allPosts = mergePost(newPost);
    var zip = new JSZip();

    // Post pages (ko/en)
    zip.file('blog/' + slug + '.html', BT.renderPostPage({
      lang: 'ko', slug: slug, date: date, tags: tags,
      title: newPost.ko.title, excerpt: newPost.ko.excerpt,
      bodyHtml: bodyHtmlKo, updatedNote: updatedNoteKo
    }));
    zip.file('en/blog/' + slug + '.html', BT.renderPostPage({
      lang: 'en', slug: slug, date: date, tags: tags,
      title: newPost.en.title, excerpt: newPost.en.excerpt,
      bodyHtml: bodyHtmlEn, updatedNote: updatedNoteEn
    }));

    // Index pages
    zip.file('blog/index.html', BT.renderIndexPage({ lang: 'ko', posts: allPosts, updatedNote: updatedNoteKo }));
    zip.file('en/blog/index.html', BT.renderIndexPage({ lang: 'en', posts: allPosts, updatedNote: updatedNoteEn }));

    // Tag pages (regenerate every tag that appears in the full post list)
    var allTags = BT.uniqueTags(allPosts);
    allTags.forEach(function (t) {
      var postsForTag = allPosts.filter(function (p) { return (p.tags || []).some(function (tg) { return BT.slugify(tg, 'tag') === t.slug; }); });
      zip.file('blog/tag/' + t.slug + '.html', BT.renderTagPage({ lang: 'ko', tag: t.tag, tagSlug: t.slug, posts: postsForTag, updatedNote: updatedNoteKo }));
      zip.file('en/blog/tag/' + t.slug + '.html', BT.renderTagPage({ lang: 'en', tag: t.tag, tagSlug: t.slug, posts: postsForTag, updatedNote: updatedNoteEn }));
    });

    // posts.json
    zip.file('blog/posts.json', JSON.stringify({ posts: allPosts }, null, 2) + '\n');

    // Images referenced from the body (added via the image picker above)
    state.images.forEach(function (img) {
      zip.file('blog/images/' + slug + '/' + img.filename, img.file);
    });

    // Sitemap: try to fetch + merge automatically; always also emit a plain
    // list of new URLs so nothing is lost if the fetch fails (e.g. testing
    // the tool from a local file:// copy instead of the live site).
    var newSegPairs = [
      [BT.pageSegments('ko', ['blog', 'index.html']), BT.pageSegments('en', ['blog', 'index.html'])],
      [BT.pageSegments('ko', ['blog', slug + '.html']), BT.pageSegments('en', ['blog', slug + '.html'])]
    ];
    allTags.forEach(function (t) {
      newSegPairs.push([BT.pageSegments('ko', ['blog', 'tag', t.slug + '.html']), BT.pageSegments('en', ['blog', 'tag', t.slug + '.html'])]);
    });

    var plainUrlList = [];
    var rootXml = await fetchTextOrNull('/sitemap.xml');
    var bioonsunXml = await fetchTextOrNull('/bioonsun/sitemap.xml');

    [{ key: 'sitemap.xml', xml: rootXml, fallbackHost: 'https://juonsun.com' },
     { key: 'bioonsun/sitemap.xml', xml: bioonsunXml, fallbackHost: 'https://www.juonsun.com' }].forEach(function (entry) {
      if (!entry.xml) return;
      var host = detectHost(entry.xml, entry.fallbackHost);
      var blocks = [];
      newSegPairs.forEach(function (pair) {
        sitemapUrlBlock(host, pair[0], pair[1]).forEach(function (b) { blocks.push(b); });
      });
      var merged = mergeSitemapXml(entry.xml, host, blocks);
      zip.file(entry.key, merged);
    });

    newSegPairs.forEach(function (pair) {
      plainUrlList.push('https://juonsun.com/bioonsun' + buildSitemapPath(pair[0]));
      plainUrlList.push('https://juonsun.com/bioonsun' + buildSitemapPath(pair[1]));
    });
    zip.file('sitemap-new-urls.txt',
      'sitemap.xml를 자동으로 갱신했습니다 (fetch 성공 시). 자동 갱신이 실패했거나 확인하고 싶다면 아래 URL이 sitemap.xml / bioonsun/sitemap.xml 에 포함되어 있는지 확인하세요:\n\n' +
      plainUrlList.join('\n') + '\n');

    var readme =
      'BioOnSun 블로그 배포 안내\n' +
      '========================\n\n' +
      '1. 이 zip을 압축 해제합니다.\n' +
      '2. 압축을 푼 폴더 안의 내용을 로컬 저장소의 bioonsun 폴더 위에 그대로 덮어씁니다.\n' +
      '   (...\\Bioonsun\\bioonsun\\ 위에 blog/, en/blog/ 폴더와 sitemap.xml 등을 덮어쓰기)\n' +
      '   ※ 이 zip에 포함된 sitemap.xml은 저장소 루트(Bioonsun\\)의 sitemap.xml에 덮어써야 하고,\n' +
      '     bioonsun/sitemap.xml은 Bioonsun\\bioonsun\\sitemap.xml에 덮어써야 합니다.\n' +
      '3. 평소처럼 git add / git commit / git push origin main 을 실행합니다.\n' +
      '4. Vercel 배포가 끝나면 juonsun.com/bioonsun/blog/ 에서 확인합니다.\n\n' +
      '이번에 생성/갱신된 글: ' + slug + ' (' + date + ')\n' +
      '태그: ' + (tags.join(', ') || '(없음)') + '\n' +
      '포함된 이미지: ' + (state.images.length ? state.images.map(function (i) { return i.filename; }).join(', ') : '(없음)') + '\n\n' +
      '참고: 이미 있는 글을 수정하면서 태그를 뺀 경우, 그 태그의 태그 페이지 파일(blog/tag/*.html)은\n' +
      '이 zip에 포함되지 않습니다 (다른 글이 그 태그를 계속 쓰고 있지 않다면). 저장소에 이미 배포된\n' +
      '오래된 태그 페이지 파일이 남아있다면 직접 삭제해도 되고, 그냥 두어도 사이트 동작에는 문제가\n' +
      '없습니다(그 페이지로 가는 링크만 사라질 뿐입니다).\n';
    zip.file('README-deploy.txt', readme);

    var blob = await zip.generateAsync({ type: 'blob' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'bioonsun-blog-' + slug + '.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);

    state.posts = allPosts;
    renderExistingList();
    status.className = 'admin-status ok';
    status.textContent = 'zip 파일을 생성했습니다 (' + slug + '.zip). 다운로드 폴더에서 확인하세요.';
  }

  // ------------------------------------------------------------------
  // Wire up
  // ------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', function () {
    initGate();

    el('fieldTitleKo').addEventListener('input', function () {
      if (!el('fieldSlug').dataset.userEdited) el('fieldSlug').value = slugSuggestion();
    });
    el('fieldTitleEn').addEventListener('input', function () {
      if (!el('fieldSlug').dataset.userEdited) el('fieldSlug').value = slugSuggestion();
    });
    el('fieldSlug').addEventListener('input', function () {
      el('fieldSlug').dataset.userEdited = '1';
    });

    ['fieldTitleKo', 'fieldTitleEn', 'fieldBodyKo', 'fieldBodyEn', 'fieldTags'].forEach(function (id) {
      el(id).addEventListener('input', updatePreview);
    });
    document.querySelectorAll('input[name="previewLang"]').forEach(function (r) {
      r.addEventListener('change', updatePreview);
    });

    el('reloadPostsBtn').addEventListener('click', loadPosts);
    el('postsFileInput').addEventListener('change', handlePostsFileUpload);
    el('existingList').addEventListener('click', handleExistingListClick);
    el('imageFileInput').addEventListener('change', handleImageFilesChange);
    el('imageList').addEventListener('click', handleImageListClick);
    el('generateBtn').addEventListener('click', generateAndDownload);

    var todayField = el('fieldDate');
    if (!todayField.value) {
      var d = new Date();
      todayField.value = d.toISOString().slice(0, 10);
    }

    loadPosts();
    updatePreview();
  });
})();
