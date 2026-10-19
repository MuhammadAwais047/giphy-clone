(() => {
  "use strict";

  const RAW = Array.isArray(window.GIF_CATALOG) ? window.GIF_CATALOG : [];
  const FAVES_KEY = "gifwave-faves-v1";
  const BATCH = 24;
  const CDN = (id, variant) => `https://media.giphy.com/media/${id}/${variant}`;
  const PAGE = (id) => `https://giphy.com/gifs/${id}`;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const ICONS = {
    heart:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7.2-4.4-9.3-8.7C1.1 7.8 3 4.5 6.5 4.1c2-.2 4 .8 5.5 2.9 1.5-2.1 3.5-3.1 5.5-2.9 3.5.4 5.4 3.7 3.8 7.2C19.2 15.6 12 20 12 20Z"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    link:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13.5a5 5 0 0 0 7.1 0l2.4-2.4a5 5 0 0 0-7.1-7.1L11 5.4"/><path d="M14 10.5a5 5 0 0 0-7.1 0l-2.4 2.4a5 5 0 0 0 7.1 7.1l1.4-1.4"/></svg>',
    download:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/></svg>',
    external:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5"/></svg>',
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
  };

  const $ = (selector, root = document) => root.querySelector(selector);

  function slugify(text) {
    return String(text)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  // ---------- Data ----------
  const seenIds = new Set();
  const GIFS = [];
  for (const item of RAW) {
    if (!item || !item.id || !item.title || !item.cat) continue;
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    const title = String(item.title).trim();
    const cat = String(item.cat).trim();
    if (!title || !cat) continue;
    GIFS.push({
      id: String(item.id),
      title,
      cat,
      slug: slugify(cat),
      desc: typeof item.desc === "string" ? item.desc.trim() : "",
    });
  }

  const CATS = [];
  {
    const byName = new Map();
    for (const gif of GIFS) {
      if (!byName.has(gif.slug)) byName.set(gif.slug, { slug: gif.slug, name: gif.cat, count: 0 });
      byName.get(gif.slug).count += 1;
    }
    CATS.push(...byName.values());
  }

  const byCat = new Map(CATS.map((cat) => [cat.slug, GIFS.filter((g) => g.slug === cat.slug)]));
  const BY_ID = new Map(GIFS.map((gif) => [gif.id, gif]));

  const now = new Date();
  const daySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(items, rand) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function buildHome() {
    const rand = mulberry32(daySeed);
    const buckets = CATS.map((cat) => seededShuffle(byCat.get(cat.slug) || [], rand));
    const order = seededShuffle(buckets.map((_, index) => index), rand);
    const pool = [];
    let added = true;
    while (added) {
      added = false;
      for (const index of order) {
        const bucket = buckets[index];
        if (bucket.length) {
          pool.push(bucket.shift());
          added = true;
        }
      }
    }
    return pool;
  }

  const HOME = buildHome();

  function loadFaves() {
    try {
      const stored = JSON.parse(window.localStorage.getItem(FAVES_KEY) || "[]");
      if (!Array.isArray(stored)) return new Set();
      return new Set(stored.filter((id) => typeof id === "string" && BY_ID.has(id)));
    } catch {
      return new Set();
    }
  }

  const state = {
    route: { name: "home" },
    items: [],
    shown: 0,
    faves: loadFaves(),
    currentGif: null,
    statusTimer: null,
    toastTimer: null,
  };

  if (!GIFS.length) {
    const feed = $("#feed");
    if (feed) {
      feed.hidden = false;
      const title = $("#feed-title");
      if (title) title.textContent = "The vault is empty";
    }
    return;
  }

  // ---------- Elements ----------
  const els = {
    hero: $("#hero"),
    ticker: $("#ticker"),
    tickerTrack: $("#ticker-track"),
    heroStack: $("#hero-stack"),
    heroBrowse: $("#hero-browse"),
    heroRandom: $("#hero-random"),
    statGifs: $("#stat-gifs"),
    statGifs2: $("#stat-gifs-2"),
    statCats: $("#stat-cats"),
    chips: $("#chips"),
    feed: $("#feed"),
    feedEyebrow: $("#feed-eyebrow"),
    feedTitle: $("#feed-title"),
    feedSub: $("#feed-sub"),
    feedRandom: $("#feed-random"),
    grid: $("#grid"),
    empty: $("#empty"),
    endcap: $("#endcap"),
    loadMore: $("#load-more"),
    endNote: $("#end-note"),
    searchForm: $("#search-form"),
    searchInput: $("#search-input"),
    searchClear: $("#search-clear"),
    randomBtn: $("#random-btn"),
    favesBtn: $("#faves-btn"),
    faveCount: $("#fave-count"),
    detail: $("#detail"),
    detailBody: $("#detail-body"),
    toast: $("#toast"),
    live: $("#live"),
  };

  // ---------- Utilities ----------
  function note(message) {
    if (els.detail.open) {
      const status = $(".detail-status", els.detail);
      if (status) {
        status.textContent = message;
        window.clearTimeout(state.statusTimer);
        state.statusTimer = window.setTimeout(() => {
          if (status.isConnected) status.textContent = "";
        }, 2600);
      }
      return;
    }
    toast(message);
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-show");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => els.toast.classList.remove("is-show"), 2400);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "-1000px";
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      area.remove();
      return ok;
    }
  }

  function tallEnough(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) {
      hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
    }
    return hash % 7 === 0;
  }

  function gifFileName(gif) {
    const base = slugify(gif.title) || "gifwave";
    return `${base}.gif`;
  }

  function saveFaves() {
    try {
      window.localStorage.setItem(FAVES_KEY, JSON.stringify([...state.faves]));
    } catch {
      toast("Your browser blocked local storage");
    }
  }

  // ---------- Routing ----------
  function parseRoute() {
    const raw = window.location.hash.replace(/^#\/?/, "");
    if (!raw) return { name: "home" };
    const slash = raw.indexOf("/");
    const kind = slash === -1 ? raw : raw.slice(0, slash);
    const rest = slash === -1 ? "" : raw.slice(slash + 1);

    if (kind === "category" && rest) {
      const slug = safeDecode(rest);
      if (byCat.has(slug)) return { name: "category", slug };
      return { name: "home" };
    }
    if (kind === "search") {
      const query = safeDecode(rest).trim();
      if (query) return { name: "search", query };
      return { name: "home" };
    }
    if (kind === "favorites") return { name: "favorites" };
    return { name: "home" };
  }

  function navigate(hash) {
    if (window.location.hash === hash) {
      renderRoute();
      return;
    }
    window.location.hash = hash;
  }

  function itemsFor(route) {
    switch (route.name) {
      case "category":
        return byCat.get(route.slug) || [];
      case "search":
        return searchGifs(route.query);
      case "favorites":
        return [...state.faves]
          .reverse()
          .map((id) => BY_ID.get(id))
          .filter(Boolean);
      default:
        return HOME;
    }
  }

  function searchGifs(query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const scored = [];
    for (const gif of GIFS) {
      const title = gif.title.toLowerCase();
      const desc = gif.desc.toLowerCase();
      const cat = gif.cat.toLowerCase();
      let score = 0;
      let matchedAll = true;
      for (const term of terms) {
        let termScore = 0;
        if (title === term) termScore = 14;
        else if (title.startsWith(term)) termScore = 10;
        else if (title.includes(term)) termScore = 6;
        else if (cat.includes(term)) termScore = 4;
        else if (desc.includes(term)) termScore = 2;
        else {
          matchedAll = false;
          break;
        }
        score += termScore;
      }
      if (matchedAll) scored.push({ gif, score });
    }
    scored.sort((a, b) => b.score - a.score || a.gif.title.localeCompare(b.gif.title));
    return scored.map((entry) => entry.gif);
  }

  // ---------- Rendering ----------
  function renderRoute(options = {}) {
    const { scroll = true, announce = true } = options;
    const route = parseRoute();
    state.route = route;
    state.items = itemsFor(route);
    state.shown = Math.min(BATCH, state.items.length);

    const isHome = route.name === "home";
    els.hero.hidden = !isHome;
    els.ticker.hidden = !isHome;

    renderFeedHead(route);
    renderGrid();
    syncChips();
    syncSearchBox();
    syncFavesNav();
    syncFaveUI();
    updateEndcap();

    document.title = titleFor(route);

    if (scroll) window.scrollTo(0, 0);
    if (announce) els.live.textContent = announceFor(route);
  }

  function titleFor(route) {
    if (route.name === "category") {
      const cat = CATS.find((entry) => entry.slug === route.slug);
      return `${cat ? cat.name : "Mood"} GIFs · gifwave`;
    }
    if (route.name === "search") return `Search: ${route.query} · gifwave`;
    if (route.name === "favorites") return "Saved GIFs · gifwave";
    return "gifwave — say it with a loop";
  }

  function announceFor(route) {
    const count = state.items.length;
    const unit = count === 1 ? "loop" : "loops";
    if (route.name === "search") {
      return `Search results for ${route.query}. ${count} ${unit}.`;
    }
    if (route.name === "favorites") return `Saved loops. ${count} ${unit} in your vault.`;
    if (route.name === "category") {
      const cat = CATS.find((entry) => entry.slug === route.slug);
      return `${cat ? cat.name : "Mood"} loops. ${count} ${unit}.`;
    }
    return `The vault. ${count} ${unit}.`;
  }

  function renderFeedHead(route) {
    if (route.name === "category") {
      const cat = CATS.find((entry) => entry.slug === route.slug);
      els.feedEyebrow.textContent = "Mood";
      els.feedTitle.textContent = cat ? cat.name : "Mood";
      els.feedSub.textContent = `${state.items.length} ${state.items.length === 1 ? "loop" : "loops"} filed under ${cat ? cat.name.toLowerCase() : "this mood"}.`;
      return;
    }
    if (route.name === "search") {
      els.feedEyebrow.textContent = "Search results";
      els.feedTitle.textContent = `\u201C${route.query}\u201D`;
      els.feedSub.textContent = state.items.length
        ? `${state.items.length} ${state.items.length === 1 ? "loop" : "loops"} matched in the vault.`
        : "Nothing matched — try a broader word or browse a mood.";
      return;
    }
    if (route.name === "favorites") {
      els.feedEyebrow.textContent = "Your vault";
      els.feedTitle.textContent = "Saved loops";
      els.feedSub.textContent = `${state.items.length} ${state.items.length === 1 ? "loop" : "loops"} saved in this browser.`;
      return;
    }
    els.feedEyebrow.textContent = "The vault";
    els.feedTitle.textContent = "Today\u2019s wave";
    els.feedSub.textContent = `A handpicked mix across all ${CATS.length} moods — reshuffled every day.`;
  }

  function renderGrid() {
    els.grid.replaceChildren();
    if (!state.items.length) {
      els.grid.hidden = true;
      renderEmpty(state.route);
      return;
    }
    els.grid.hidden = false;
    els.empty.hidden = true;
    els.empty.replaceChildren();
    appendCards(state.items.slice(0, state.shown), 0);
  }

  function appendCards(items, startIndex) {
    const fragment = document.createDocumentFragment();
    items.forEach((gif, index) => {
      fragment.appendChild(buildCard(gif, startIndex + index));
    });
    els.grid.appendChild(fragment);
  }

  function buildCard(gif, index) {
    const card = document.createElement("article");
    card.className = "card";
    if (tallEnough(gif.id) && index % 2 === 0) card.classList.add("card--tall");
    card.dataset.id = gif.id;
    card.setAttribute("role", "listitem");

    const open = document.createElement("button");
    open.type = "button";
    open.className = "card-open";
    open.setAttribute("aria-label", `Open "${gif.title}"`);

    const media = document.createElement("span");
    media.className = "card-media";
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener(
      "load",
      () => {
        card.classList.add("is-loaded");
      },
      { once: true }
    );
    img.addEventListener("error", () => {
      if (!img.dataset.retried) {
        img.dataset.retried = "1";
        img.src = CDN(gif.id, "200w.gif");
        return;
      }
      card.classList.add("is-broken");
    });
    img.src = CDN(gif.id, "200w.webp");
    media.appendChild(img);

    const shade = document.createElement("span");
    shade.className = "card-shade";

    const via = document.createElement("span");
    via.className = "card-via";
    via.textContent = "via GIPHY";

    const meta = document.createElement("span");
    meta.className = "card-meta";
    const title = document.createElement("span");
    title.className = "card-title";
    title.textContent = gif.title;
    const cat = document.createElement("span");
    cat.className = "card-cat";
    cat.textContent = gif.cat;
    meta.append(title, cat);

    open.append(media, shade, via, meta);

    const fave = document.createElement("button");
    fave.type = "button";
    fave.className = "card-fave";
    fave.dataset.faveId = gif.id;
    fave.innerHTML = ICONS.heart;

    card.append(open, fave);
    return card;
  }

  function renderEmpty(route) {
    els.empty.replaceChildren();
    const icon = document.createElement("div");
    icon.className = "empty-ico";
    icon.innerHTML = route.name === "favorites" ? ICONS.heart : ICONS.search;

    const heading = document.createElement("h3");
    const copy = document.createElement("p");

    if (route.name === "favorites") {
      heading.textContent = "Nothing saved yet";
      copy.textContent = "Tap the heart on any loop and it will wait for you here, in this browser.";
    } else if (route.name === "search") {
      heading.textContent = `No loops for \u201C${route.query}\u201D`;
      copy.textContent = "Try a mood, an action, or a broader word — “dance”, “cat”, and “wow” all work.";
    } else {
      heading.textContent = "This mood wandered off";
      copy.textContent = "That corner of the vault is empty. Head back and pick another wave.";
    }

    const browse = document.createElement("button");
    browse.type = "button";
    browse.className = "primary-btn";
    browse.textContent = "Browse the vault";
    browse.addEventListener("click", () => navigate("#/"));

    els.empty.append(icon, heading, copy);

    if (route.name === "search") {
      const quick = document.createElement("div");
      quick.className = "empty-quick";
      ["dance", "cat", "wow"].forEach((term) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = term;
        chip.addEventListener("click", () => navigate(`#/search/${encodeURIComponent(term)}`));
        quick.appendChild(chip);
      });
      els.empty.appendChild(quick);
    }

    els.empty.appendChild(browse);
    els.empty.hidden = false;
  }

  function updateEndcap() {
    if (!state.items.length) {
      els.endcap.hidden = true;
      return;
    }
    els.endcap.hidden = false;
    const more = state.shown < state.items.length;
    els.loadMore.hidden = !more;
    els.endNote.hidden = more;
    if (!more) els.endNote.textContent = endNoteFor(state.route);
  }

  function endNoteFor(route) {
    if (route.name === "favorites") return "That’s everything in your vault.";
    if (route.name === "search") return "That’s every match in the vault.";
    if (route.name === "category") {
      const cat = CATS.find((entry) => entry.slug === route.slug);
      return `That’s the whole ${cat ? cat.name : "mood"} wave.`;
    }
    return "You’ve reached the end of today’s wave.";
  }

  function renderMore({ announce = false } = {}) {
    if (state.shown >= state.items.length) return;
    const start = state.shown;
    const next = state.items.slice(start, start + BATCH);
    appendCards(next, start);
    state.shown += next.length;
    updateEndcap();
    if (announce) {
      els.live.textContent = `${next.length} more loops loaded. ${state.shown} of ${state.items.length} showing.`;
    }
  }

  // ---------- Navigation sync ----------
  function syncChips() {
    for (const chip of els.chips.children) {
      const slug = chip.dataset.slug || "";
      const active =
        state.route.name === "category"
          ? slug === state.route.slug
          : state.route.name === "home" && slug === "";
      chip.classList.toggle("active", active);
      chip.setAttribute("aria-pressed", String(active));
      if (active && state.route.name === "category" && chip.isConnected) {
        chip.scrollIntoView({ block: "nearest", inline: "center" });
      }
    }
  }

  function syncSearchBox() {
    els.searchInput.value = state.route.name === "search" ? state.route.query : "";
    syncClearButton();
  }

  function syncClearButton() {
    els.searchClear.hidden = !els.searchInput.value;
  }

  function syncFavesNav() {
    const count = state.faves.size;
    els.faveCount.textContent = String(count);
    els.faveCount.hidden = count === 0;
    els.favesBtn.setAttribute("aria-label", `Saved GIFs, ${count} saved`);
    els.favesBtn.setAttribute("aria-pressed", String(state.route.name === "favorites"));
  }

  function syncFaveUI() {
    for (const button of document.querySelectorAll("[data-fave-id]")) {
      const id = button.dataset.faveId;
      const gif = BY_ID.get(id);
      const saved = state.faves.has(id);
      button.classList.toggle("is-saved", saved);
      button.setAttribute("aria-pressed", String(saved));
      const name = gif ? `"${gif.title}"` : "this loop";
      button.setAttribute(
        "aria-label",
        saved ? `Remove ${name} from your vault` : `Save ${name} to your vault`
      );
    }
    syncFavesNav();
  }

  function toggleFave(id) {
    if (!BY_ID.has(id)) return;
    const wasSaved = state.faves.has(id);
    if (wasSaved) state.faves.delete(id);
    else state.faves.add(id);
    saveFaves();
    syncFaveUI();
    note(wasSaved ? "Removed from your vault" : "Saved to your vault");

    if (state.route.name === "favorites") {
      const y = window.scrollY;
      renderRoute({ scroll: false, announce: false });
      window.requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }

  // ---------- Detail dialog ----------
  function openDetail(gif) {
    if (!gif) return;
    state.currentGif = gif;
    renderDetail(gif);
    if (!els.detail.open) {
      els.detail.showModal();
      document.body.classList.add("modal-open");
    } else {
      els.detail.scrollTop = 0;
    }
  }

  function makeDetailMedia(gif) {
    const mount = document.createElement("div");
    mount.className = "detail-media";

    const fallback = () => {
      if (mount.dataset.fallback === "1") return;
      mount.dataset.fallback = "1";
      const img = document.createElement("img");
      img.alt = `${gif.title} — animated GIF`;
      img.src = CDN(gif.id, "giphy.webp");
      img.addEventListener("error", () => {
        img.alt = gif.title;
      });
      mount.querySelector("video")?.remove();
      mount.appendChild(img);
    };

    if (reduceMotion.matches) {
      const img = document.createElement("img");
      img.alt = `${gif.title} — animated GIF`;
      img.src = CDN(gif.id, "giphy.webp");
      mount.appendChild(img);
      return mount;
    }

    const video = document.createElement("video");
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    video.setAttribute("aria-label", `${gif.title} — animated GIF`);
    video.poster = CDN(gif.id, "200w.webp");
    video.addEventListener("error", fallback);

    const source = document.createElement("source");
    source.src = CDN(gif.id, "giphy.mp4");
    source.type = "video/mp4";
    source.addEventListener("error", fallback);
    video.appendChild(source);

    mount.appendChild(video);
    const play = video.play();
    if (play && typeof play.catch === "function") play.catch(() => {});

    return mount;
  }

  function renderDetail(gif) {
    els.detailBody.replaceChildren();

    const media = makeDetailMedia(gif);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "detail-close";
    close.setAttribute("aria-label", "Close");
    close.innerHTML = ICONS.close;
    close.addEventListener("click", () => els.detail.close());
    media.appendChild(close);

    const main = document.createElement("div");
    main.className = "detail-main";

    const head = document.createElement("div");
    head.className = "detail-head";

    const copy = document.createElement("div");
    const cat = document.createElement("p");
    cat.className = "detail-cat";
    cat.textContent = gif.cat;
    const title = document.createElement("h3");
    title.id = "detail-title";
    title.textContent = gif.title;
    copy.append(cat, title);
    if (gif.desc) {
      const desc = document.createElement("p");
      desc.className = "detail-desc";
      desc.textContent = gif.desc;
      copy.appendChild(desc);
    }

    const save = document.createElement("button");
    save.type = "button";
    save.className = "detail-save";
    save.dataset.faveId = gif.id;
    save.innerHTML = ICONS.heart;
    save.addEventListener("click", () => toggleFave(gif.id));

    head.append(copy, save);

    const actions = document.createElement("div");
    actions.className = "detail-actions";

    const download = document.createElement("button");
    download.type = "button";
    download.className = "d-btn d-btn--primary";
    download.innerHTML = `${ICONS.download}<span>Download GIF</span>`;
    download.addEventListener("click", () => downloadGif(gif, download));

    const copyLink = document.createElement("button");
    copyLink.type = "button";
    copyLink.className = "d-btn";
    copyLink.innerHTML = `${ICONS.link}<span>Copy link</span>`;
    copyLink.addEventListener("click", async () => {
      const ok = await copyText(PAGE(gif.id));
      note(ok ? "GIPHY link copied" : "Couldn’t copy — use Open on GIPHY");
    });

    const external = document.createElement("a");
    external.className = "d-btn";
    external.href = PAGE(gif.id);
    external.target = "_blank";
    external.rel = "noopener noreferrer";
    external.innerHTML = `${ICONS.external}<span>Open on GIPHY</span>`;

    actions.append(download, copyLink, external);

    const status = document.createElement("p");
    status.className = "detail-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    main.append(head, actions, status);

    const related = buildRelated(gif);
    if (related) main.appendChild(related);

    els.detailBody.append(media, main);
    syncFaveUI();
  }

  function buildRelated(gif) {
    const pool = byCat.get(gif.slug) || [];
    if (pool.length < 2) return null;

    const index = pool.findIndex((entry) => entry.id === gif.id);
    const picks = [];
    for (let offset = 1; offset <= Math.min(6, pool.length - 1); offset += 1) {
      picks.push(pool[(index + offset) % pool.length]);
    }
    if (!picks.length) return null;

    const section = document.createElement("div");
    section.className = "detail-related";
    const heading = document.createElement("h4");
    heading.textContent = `More in ${gif.cat}`;
    const grid = document.createElement("div");
    grid.className = "rel-grid";

    for (const item of picks) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rel";
      button.setAttribute("aria-label", `Open "${item.title}"`);
      const img = document.createElement("img");
      img.src = CDN(item.id, "200w.webp");
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      button.appendChild(img);
      button.addEventListener("click", () => {
        openDetail(item);
        const closeBtn = $(".detail-close", els.detail);
        if (closeBtn) closeBtn.focus();
      });
      grid.appendChild(button);
    }

    section.append(heading, grid);
    return section;
  }

  async function downloadGif(gif, button) {
    if (button.disabled) return;
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = "Preparing…";

    try {
      const response = await fetch(CDN(gif.id, "giphy.gif"), { mode: "cors" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.size) throw new Error("Empty file");

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = gifFileName(gif);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      note("GIF download started");
    } catch {
      note("Download blocked — opening on GIPHY instead");
      window.open(PAGE(gif.id), "_blank", "noopener");
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  function surprise() {
    if (!GIFS.length) return;
    let pick = GIFS[Math.floor(Math.random() * GIFS.length)];
    if (GIFS.length > 1 && state.currentGif && pick.id === state.currentGif.id) {
      const index = GIFS.indexOf(pick);
      pick = GIFS[(index + 1) % GIFS.length];
    }
    openDetail(pick);
  }

  // ---------- Chrome ----------
  function buildHero() {
    const rand = mulberry32(daySeed ^ 0x9e3779b9);
    const picks = [];
    for (const slug of ["cats", "space", "dance"]) {
      const pool = byCat.get(slug);
      if (pool && pool.length) picks.push(pool[Math.floor(rand() * pool.length)]);
    }
    for (const gif of HOME) {
      if (picks.length >= 3) break;
      if (!picks.includes(gif)) picks.push(gif);
    }
    const classes = ["hs-a", "hs-b", "hs-c"];
    picks.slice(0, 3).forEach((gif, index) => {
      const figure = document.createElement("figure");
      figure.className = `hero-gif ${classes[index]}`;
      const img = document.createElement("img");
      img.src = CDN(gif.id, "200w.webp");
      img.alt = "";
      img.decoding = "async";
      img.fetchPriority = "high";
      figure.appendChild(img);
      els.heroStack.appendChild(figure);
    });
  }

  function buildTicker() {
    const words = [
      "Say it with a loop",
      ...CATS.map((cat) => cat.name),
      `${GIFS.length} loops`,
      "No accounts",
      "Vanilla JS",
    ];
    for (let group = 0; group < 2; group += 1) {
      const row = document.createElement("div");
      row.className = "ticker-group";
      for (const word of words) {
        const item = document.createElement("span");
        item.className = "ticker-item";
        item.textContent = word;
        row.appendChild(item);
      }
      els.tickerTrack.appendChild(row);
    }
  }

  function buildChips() {
    const colors = [
      "#8b5cff",
      "#ff4fa3",
      "#d6ff5f",
      "#5ce1ff",
      "#ffa14f",
      "#f16b6b",
      "#b38bff",
      "#7dffc4",
      "#ffd166",
      "#66b8ff",
      "#ff8bd1",
      "#c3e88d",
    ];

    const all = document.createElement("button");
    all.type = "button";
    all.className = "chip";
    all.dataset.slug = "";
    all.innerHTML = `<span>All</span><span class="chip-count">${GIFS.length}</span>`;
    all.setAttribute("aria-pressed", "true");
    els.chips.appendChild(all);

    CATS.forEach((cat, index) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.slug = cat.slug;
      chip.setAttribute("aria-pressed", "false");

      const dot = document.createElement("span");
      dot.className = "chip-dot";
      dot.style.background = colors[index % colors.length];
      dot.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.textContent = cat.name;

      const count = document.createElement("span");
      count.className = "chip-count";
      count.textContent = String(cat.count);

      chip.append(dot, label, count);
      els.chips.appendChild(chip);
    });

    els.chips.addEventListener("click", (event) => {
      const chip = event.target.closest(".chip");
      if (!chip) return;
      const slug = chip.dataset.slug;
      navigate(slug ? `#/category/${slug}` : "#/");
    });
  }

  function syncStats() {
    els.statGifs.textContent = String(GIFS.length);
    els.statGifs2.textContent = String(GIFS.length);
    els.statCats.textContent = String(CATS.length);
  }

  // ---------- Events ----------
  function bindEvents() {
    window.addEventListener("hashchange", () => renderRoute());

    els.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = els.searchInput.value.trim();
      if (!query) {
        navigate("#/");
        return;
      }
      navigate(`#/search/${encodeURIComponent(query)}`);
      els.searchInput.blur();
    });

    els.searchInput.addEventListener("input", syncClearButton);

    els.searchClear.addEventListener("click", () => {
      els.searchInput.value = "";
      syncClearButton();
      if (state.route.name === "search") navigate("#/");
      els.searchInput.focus();
    });

    els.grid.addEventListener("click", (event) => {
      const fave = event.target.closest(".card-fave");
      if (fave) {
        toggleFave(fave.dataset.faveId);
        return;
      }
      const open = event.target.closest(".card-open");
      if (!open) return;
      const card = open.closest(".card");
      const gif = card ? BY_ID.get(card.dataset.id) : null;
      if (gif) openDetail(gif);
    });

    els.loadMore.addEventListener("click", () => renderMore({ announce: true }));

    [els.randomBtn, els.heroRandom, els.feedRandom].forEach((button) => {
      button.addEventListener("click", surprise);
    });

    els.favesBtn.addEventListener("click", () => navigate("#/favorites"));

    els.heroBrowse.addEventListener("click", () => {
      els.feed.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
    });

    els.detail.addEventListener("click", (event) => {
      if (event.target === els.detail) els.detail.close();
    });

    els.detail.addEventListener("close", () => {
      document.body.classList.remove("modal-open");
      els.detailBody.replaceChildren();
      window.clearTimeout(state.statusTimer);
    });

    document.addEventListener("keydown", (event) => {
      if (els.detail.open) return;
      const target = event.target;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      const slash = event.key === "/" && !typing;
      const commandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (slash || commandK) {
        event.preventDefault();
        els.searchInput.focus();
        els.searchInput.select();
      }
    });
  }

  function initObserver() {
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          if (!els.endcap.hidden && !els.loadMore.hidden) renderMore();
        }
      },
      { rootMargin: "420px 0px" }
    );
    observer.observe(els.endcap);
  }

  function init() {
    if (!window.location.hash) {
      window.history.replaceState(null, "", "#/");
    }
    syncStats();
    buildHero();
    buildTicker();
    buildChips();
    bindEvents();
    renderRoute({ scroll: false, announce: false });
    initObserver();
  }

  init();
})();
