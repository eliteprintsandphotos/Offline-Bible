(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var bible = window.KJV;
  var reader = $("reader"), results = $("results");

  if (!bible) {
    reader.innerHTML = '<p class="msg">Could not load data/kjv/kjv.js. Keep it next to index.html.</p>';
    return;
  }
  var books = bible.books;

  // ---- storage (optional; the reader works without it) ----
  function load(key, fallback) {
    try { var v = localStorage.getItem("ob." + key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem("ob." + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  // ---- settings ----
  var fontSize = load("fontSize", 20);
  function applyFont() { document.documentElement.style.setProperty("--font-size", fontSize + "px"); }
  $("smaller").onclick = function () { fontSize = Math.max(14, fontSize - 2); applyFont(); save("fontSize", fontSize); };
  $("larger").onclick = function () { fontSize = Math.min(36, fontSize + 2); applyFont(); save("fontSize", fontSize); };
  applyFont();

  // The Android app passes the phone's dark-mode setting as ?theme=dark|light.
  var sysTheme = (location.search.match(/[?&]theme=(dark|light)/) || [])[1] ||
    (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  var theme = load("theme", sysTheme);
  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    // Let the Android app colour its status bar to match.
    try { if (window.AndroidApp) window.AndroidApp.setTheme(theme); } catch (e) { /* ignore */ }
  }
  $("theme").onclick = function () { theme = theme === "dark" ? "light" : "dark"; applyTheme(); save("theme", theme); };
  applyTheme();

  // ---- book lookup by name or abbreviation ----
  function norm(s) {
    return s.toLowerCase().replace(/^iii\s*/, "3").replace(/^ii\s*/, "2").replace(/^i\s+/, "1")
      .replace(/^(first|1st)\s*/, "1").replace(/^(second|2nd)\s*/, "2").replace(/^(third|3rd)\s*/, "3")
      .replace(/[^a-z0-9]/g, "");
  }
  var aliases = { psalm: "ps", song: "song", songofsongs: "song", canticles: "song", revelations: "rev", jn: "john", mt: "matt", mk: "mark", lk: "luke" };
  function findBook(name) {
    var n = norm(name);
    if (!n) return -1;
    if (aliases[n]) n = aliases[n];
    var i, prefix = -1;
    for (i = 0; i < books.length; i++) {
      var full = norm(books[i].name), ab = norm(books[i].abbrev);
      if (n === full || n === ab) return i;
      if (prefix < 0 && n.length >= 2 && (full.indexOf(n) === 0 || ab.indexOf(n) === 0)) prefix = i;
    }
    return prefix;
  }

  // "John 3:16", "1 Cor 13", "ps 23.4", "Jude"
  function parseRef(q) {
    var m = q.trim().match(/^((?:[123]|i{1,3})?\s*[a-z][a-z .]*?)\s*(\d+)?(?:\s*[:.]\s*(\d+))?$/i);
    if (!m) return null;
    var b = findBook(m[1]);
    if (b < 0) return null;
    var c = m[2] ? +m[2] : 1, v = m[3] ? +m[3] : 0;
    if (c < 1 || c > books[b].chapters.length) return null;
    if (v > books[b].chapters[c - 1].length) v = 0;
    return { b: b, c: c, v: v };
  }

  // ---- navigation state ----
  var bookSel = $("book"), chapSel = $("chapter");
  books.forEach(function (bk, i) {
    if (i === 0 || i === 39) {
      var g = document.createElement("optgroup");
      g.label = i === 0 ? "Old Testament" : "New Testament";
      bookSel.appendChild(g);
    }
    var o = document.createElement("option");
    o.value = i; o.textContent = bk.name;
    bookSel.lastChild.appendChild(o);
  });

  function fillChapters(b) {
    chapSel.innerHTML = "";
    for (var c = 1; c <= books[b].chapters.length; c++) {
      var o = document.createElement("option");
      o.value = c; o.textContent = "Chapter " + c;
      chapSel.appendChild(o);
    }
  }

  var cur = { b: -1, c: 0 };

  function hashFor(b, c, v) { return "#" + books[b].abbrev + "." + c + (v ? "." + v : ""); }

  function go(b, c, v) { location.hash = hashFor(b, c, v); }

  function render(b, c, v) {
    if (b !== cur.b) fillChapters(b);
    bookSel.value = b; chapSel.value = c;
    var changed = b !== cur.b || c !== cur.c;
    cur = { b: b, c: c };
    save("pos", [b, c]);

    var bk = books[b];
    document.title = bk.name + " " + c + " · Offline Bible";
    var html = "<h1>" + bk.name + " " + c + "</h1><p>";
    bk.chapters[c - 1].forEach(function (t, i) {
      html += '<span class="v" id="v' + (i + 1) + '"><sup>' + (i + 1) + "</sup>" + esc(t) + "</span> ";
    });
    html += '</p><div class="pager">';
    var p = step(-1), n = step(1);
    html += p ? '<button data-go="-1">‹ ' + label(p) + "</button>" : "<span></span>";
    html += n ? '<button data-go="1">' + label(n) + " ›</button>" : "<span></span>";
    html += "</div>";
    reader.innerHTML = html;

    results.hidden = true;
    reader.hidden = false;
    if (v) {
      var el = $("v" + v);
      if (el) { el.classList.add("hl"); el.scrollIntoView({ block: "center" }); }
    } else if (changed) {
      window.scrollTo(0, 0);
    }
    $("prev").disabled = !p;
    $("next").disabled = !n;
  }

  function step(d) {
    var b = cur.b, c = cur.c + d;
    if (c < 1) { if (--b < 0) return null; c = books[b].chapters.length; }
    else if (c > books[b].chapters.length) { if (++b >= books.length) return null; c = 1; }
    return { b: b, c: c };
  }
  function label(p) { return books[p.b].abbrev + " " + p.c; }
  function move(d) { var p = step(d); if (p) go(p.b, p.c); }

  function esc(s) {
    return s.replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; });
  }

  // ---- routing ----
  function route() {
    var h = decodeURIComponent(location.hash.slice(1));
    if (h.indexOf("search=") === 0) { showSearch(h.slice(7)); return; }
    var r = h && parseRef(h.replace(/\./g, " ").replace(/^(\S+\s\d+)\s(\d+)$/, "$1:$2"));
    if (r) { render(r.b, r.c, r.v); return; }
    var pos = load("pos", [0, 1]);
    if (!books[pos[0]] || !books[pos[0]].chapters[pos[1] - 1]) pos = [0, 1];
    render(pos[0], pos[1], 0);
  }

  // ---- search ----
  var MAX_HITS = 500;
  function showSearch(q) {
    $("q").value = q;
    var phrase = q.toLowerCase().replace(/\s+/g, " ").trim();
    if (!phrase) return;
    var hits = [], total = 0;
    books.forEach(function (bk, b) {
      bk.chapters.forEach(function (vs, c) {
        vs.forEach(function (t, v) {
          if (t.toLowerCase().indexOf(phrase) < 0) return;
          total++;
          if (hits.length < MAX_HITS) hits.push([b, c + 1, v + 1, t]);
        });
      });
    });
    var re = new RegExp("(" + esc(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    var html = "<h2>" + total.toLocaleString() + " verse" + (total === 1 ? "" : "s") + " containing “" + esc(q) + "”" +
      (total > MAX_HITS ? " (showing first " + MAX_HITS + ")" : "") + "</h2>";
    hits.forEach(function (h) {
      html += '<a class="hit" href="' + hashFor(h[0], h[1], h[2]) + '"><span class="ref">' +
        books[h[0]].name + " " + h[1] + ":" + h[2] + "</span><div>" + esc(h[3]).replace(re, "<mark>$1</mark>") + "</div></a>";
    });
    if (!total) html += '<p class="msg">No verses found.</p>';
    results.innerHTML = html;
    reader.hidden = true;
    results.hidden = false;
    document.title = "Search: " + q + " · Offline Bible";
    window.scrollTo(0, 0);
  }

  $("search-form").onsubmit = function (e) {
    e.preventDefault();
    var q = $("q").value.trim();
    if (!q) return;
    var r = parseRef(q);
    var exactBook = books.some(function (bk) { return norm(bk.name) === norm(q) || norm(bk.abbrev) === norm(q); });
    if (r && (/\d$/.test(q) || exactBook)) { go(r.b, r.c, r.v); $("q").blur(); return; }
    location.hash = "search=" + encodeURIComponent(q);
  };

  // ---- events ----
  bookSel.onchange = function () { go(+bookSel.value, 1); };
  chapSel.onchange = function () { go(cur.b, +chapSel.value); };
  $("prev").onclick = function () { move(-1); };
  $("next").onclick = function () { move(1); };
  reader.addEventListener("click", function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.go) move(+t.dataset.go);
    else if (t.tagName === "SUP") go(cur.b, cur.c, +t.textContent);
  });
  document.addEventListener("keydown", function (e) {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowLeft") move(-1);
    else if (e.key === "ArrowRight") move(1);
    else if (e.key === "/") { e.preventDefault(); $("q").focus(); }
  });
  window.addEventListener("hashchange", route);

  route();
})();
