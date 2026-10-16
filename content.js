(() => {
  if (window.__screenDrawLoaded) return;
  window.__screenDrawLoaded = true;

  const state = { open: false, tool: "pen", color: "#ff3b30", size: 4, laserFade: 800, laserGlow: 10, barPos: null, strokes: [], redo: [], current: null };
  let host, root, canvas, ctx, lcanvas, lctx, bar, textInput = null;
  let idleTimer = null, drag = null, pickerOpen = false, lastGlow = "";
  let trail = [], laserCur = null, laserPos = null, laserRunning = false, laserDown = false;  // trail = list of separate laser strokes

  const CSS = `
    :host { all: initial; }
    canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; }
    #draw { pointer-events: auto; touch-action: none; }
    #laser { pointer-events: none; }
    #bar { position: fixed; left: 50%; top: calc(100% - 44px); transform: translate(-50%, -50%);
      display: flex; gap: 6px; align-items: center; padding: 8px 10px; border-radius: 14px;
      background: rgba(30,30,34,.94); box-shadow: 0 6px 24px rgba(0,0,0,.35);
      font: 14px system-ui, sans-serif; color: #fff; pointer-events: auto; user-select: none;
      touch-action: none; transition: opacity .25s; }
    /* idle: faded + collapsed to the grip and the active tool only */
    #bar.idle { opacity: .35; }
    #bar.idle > :not(.grip):not(button.active) { display: none; }
    /* vertical layout when docked to the left/right edge */
    #bar.vertical { flex-direction: column; max-height: calc(100vh - 16px); overflow-y: auto; overflow-x: hidden; scrollbar-width: none; }
    #bar.vertical .sep { width: 22px; height: 1px; margin: 4px 0; }
    #bar.vertical input[type=range] { writing-mode: vertical-lr; direction: rtl; width: 20px; height: 70px; }
    #bar.vertical label.glow input { height: 50px; width: 20px; }
    #bar.vertical label.fade.show, #bar.vertical label.glow.show { flex-direction: column; }
    .grip { cursor: grab; padding: 2px 4px; font-size: 18px; line-height: 1; opacity: .7; letter-spacing: -2px; }
    #bar.dragging, #bar.dragging .grip { cursor: grabbing; }
    button { all: unset; cursor: pointer; padding: 6px 9px; border-radius: 8px; font-size: 16px; line-height: 1; }
    button:hover { background: rgba(255,255,255,.15); }
    button:disabled { cursor: default; opacity: .35; }
    button:disabled:hover { background: transparent; }
    button.active { background: #3b82f6; }
    input[type=color] { width: 30px; height: 30px; border: none; padding: 0; background: none; cursor: pointer; }
    input[type=range] { width: 80px; }
    label.fade, label.glow { display: none; align-items: center; gap: 5px; font-size: 12px; }
    label.fade.show, label.glow.show { display: flex; }
    label.glow input { width: 60px; }
    label.fade span { min-width: 28px; }
    .sep { width: 1px; height: 22px; background: rgba(255,255,255,.25); margin: 0 4px; }
    textarea { position: fixed; background: transparent; border: 1px dashed rgba(128,128,128,.8);
      outline: none; resize: both; padding: 0; margin: 0; line-height: 1.2; font-family: sans-serif;
      min-width: 80px; min-height: 1.4em; pointer-events: auto; }
  `;

  function build() {
    host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}</style>
      <canvas id="draw"></canvas><canvas id="laser"></canvas>
      <div id="bar">
        <span class="grip" id="grip" title="Drag to move">⠿</span>
        <button data-tool="pen" title="Pen">✏️</button>
        <button data-tool="highlighter" title="Highlighter">🖍️</button>
        <button data-tool="text" title="Text">T</button>
        <button data-tool="eraser" title="Eraser">🧽</button>
        <button data-tool="laser" title="Laser pointer">🔴</button>
        <button data-tool="browse" title="Browse page (scroll/click)">🖱️</button>
        <span class="sep"></span>
        <input id="color" type="color" value="${state.color}" title="Color">
        <input id="size" type="range" min="1" max="30" value="${state.size}" title="Size">
        <label class="fade" id="fadeWrap" title="How long the laser trail lasts (lower = faster fade)">Fade
          <input id="fade" type="range" min="200" max="10000" step="100" value="${state.laserFade}">
          <span id="fadeVal">${(state.laserFade / 1000).toFixed(1)}s</span>
        </label>
        <label class="glow" id="glowWrap" title="Laser glow strength (0 = off)">Glow
          <input id="glow" type="range" min="0" max="30" step="1" value="${state.laserGlow}">
        </label>
        <span class="sep"></span>
        <button id="undo" title="Undo (Ctrl+Z)">↶</button>
        <button id="redo" title="Redo (Ctrl+Shift+Z)">↷</button>
        <button id="clear" title="Clear all">🗑️</button>
        <button id="close" title="Hide (Esc)">✕</button>
      </div>`;
    document.documentElement.appendChild(host);

    canvas = root.getElementById("draw");  ctx = canvas.getContext("2d");
    lcanvas = root.getElementById("laser"); lctx = lcanvas.getContext("2d");

    root.querySelectorAll("[data-tool]").forEach(b => b.addEventListener("click", () => setTool(b.dataset.tool)));
    root.getElementById("color").addEventListener("input", e => { state.color = e.target.value; applyGlow(); });
    root.getElementById("size").addEventListener("input", e => state.size = +e.target.value);
    const fade = root.getElementById("fade"), fadeVal = root.getElementById("fadeVal");
    const showFade = v => { fade.value = v; fadeVal.textContent = (v / 1000).toFixed(1) + "s"; };
    fade.addEventListener("input", e => {
      state.laserFade = +e.target.value;
      showFade(state.laserFade);
      try { chrome.storage.local.set({ laserFade: state.laserFade }); } catch (_) {}
    });
    const glow = root.getElementById("glow");
    glow.addEventListener("input", e => {
      state.laserGlow = +e.target.value;
      applyGlow();
      try { chrome.storage.local.set({ laserGlow: state.laserGlow }); } catch (_) {}
    });
    try {
      chrome.storage.local.get({ laserFade: state.laserFade, laserGlow: state.laserGlow, barPos: null }, v => {
        state.laserFade = v.laserFade; showFade(v.laserFade);
        state.laserGlow = v.laserGlow; glow.value = v.laserGlow; applyGlow();
        state.barPos = v.barPos; placeBar();
      });
    } catch (_) {}
    root.getElementById("undo").addEventListener("click", undo);
    root.getElementById("redo").addEventListener("click", redo);
    root.getElementById("clear").addEventListener("click", () => {
      commitText();
      state.strokes = [];
      state.redo = [];
      updateHistoryButtons();
      redraw();
    });
    root.getElementById("close").addEventListener("click", hide);

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", () => { laserPos = null; });
    canvas.addEventListener("pointerdown", () => scheduleIdle(0));   // drawing -> toolbar steps aside
    canvas.addEventListener("wheel", onWheel, { passive: false });   // keep the page scrollable under the overlay
    window.addEventListener("scroll", onPageScroll, { passive: true });

    bar = root.getElementById("bar");
    // drag by the grip (or any empty part of the bar)
    bar.addEventListener("pointerdown", e => {
      const t = e.target;
      if (!(t.id === "grip" || t === bar || t.classList.contains("sep"))) return;
      e.preventDefault();
      const r = bar.getBoundingClientRect();
      drag = { dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2) };
      bar.setPointerCapture(e.pointerId);
      bar.classList.add("dragging");
    });
    bar.addEventListener("pointermove", e => {
      if (!drag) return;
      // near the left/right edge -> dock + vertical; move away from the edge -> horizontal again
      const EDGE = 70, LEAVE = 150;
      const prev = (state.barPos && state.barPos.side) || null;
      let side = prev;
      if (!prev) { if (e.clientX < EDGE) side = "left"; else if (e.clientX > innerWidth - EDGE) side = "right"; }
      else if (e.clientX > LEAVE && e.clientX < innerWidth - LEAVE) side = null;
      else side = e.clientX < innerWidth / 2 ? "left" : "right";
      if (side !== prev) { drag.dx = 0; drag.dy = 0; }           // bar changes shape -> re-center on the pointer
      state.barPos = { fx: (e.clientX - drag.dx) / innerWidth, fy: (e.clientY - drag.dy) / innerHeight, side };
      placeBar();
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null; bar.classList.remove("dragging");
      try { chrome.storage.local.set({ barPos: state.barPos }); } catch (_) {}
    };
    bar.addEventListener("pointerup", endDrag);
    bar.addEventListener("pointercancel", endDrag);

    // idle: wake on hover, fade + collapse shortly after the pointer leaves
    bar.addEventListener("pointerenter", wake);
    bar.addEventListener("pointerleave", () => scheduleIdle(1200));
    const colorEl = root.getElementById("color");
    colorEl.addEventListener("focus", () => { pickerOpen = true; wake(); });   // keep open while the color picker is up
    colorEl.addEventListener("blur", () => { pickerOpen = false; scheduleIdle(1200); });
    placeBar();

    window.addEventListener("resize", () => { resize(); redraw(); placeBar(); });
    window.addEventListener("keydown", onKey, true);
    resize();
    setTool(state.tool);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    for (const [c, x] of [[canvas, ctx], [lcanvas, lctx]]) {
      c.width = innerWidth * dpr; c.height = innerHeight * dpr;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function setTool(t) {
    commitText();
    state.tool = t;
    root.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("active", b.dataset.tool === t));
    canvas.style.pointerEvents = t === "browse" ? "none" : "auto";
    canvas.style.cursor = t === "text" ? "text" : "crosshair";
    root.getElementById("fadeWrap").classList.toggle("show", t === "laser");
    root.getElementById("glowWrap").classList.toggle("show", t === "laser");
    applyGlow();
    placeBar();
    trail = []; laserCur = null; laserPos = null; laserDown = false;
  }

  function updateHistoryButtons() {
    if (!root) return;
    root.getElementById("undo").disabled = state.strokes.length === 0;
    root.getElementById("redo").disabled = state.redo.length === 0;
  }

  // ---------- toolbar: position + idle ----------
  function placeBar() {
    if (!bar) return;
    const p = state.barPos || {};
    bar.classList.toggle("vertical", !!p.side);                 // layout first, then measure
    const w = bar.offsetWidth, h = bar.offsetHeight;
    let cx = (p.fx != null ? p.fx : 0.5) * innerWidth;
    let cy = (p.fy != null ? p.fy : (innerHeight - 44) / innerHeight) * innerHeight;
    if (p.side === "left") cx = w / 2 + 8;                      // stick to the edge
    else if (p.side === "right") cx = innerWidth - w / 2 - 8;
    cx = Math.min(Math.max(cx, w / 2 + 4), Math.max(w / 2 + 4, innerWidth - w / 2 - 4));
    cy = Math.min(Math.max(cy, h / 2 + 4), Math.max(h / 2 + 4, innerHeight - h / 2 - 4));
    bar.style.left = cx + "px"; bar.style.top = cy + "px";
  }
  function wake() {
    clearTimeout(idleTimer);
    if (bar) { bar.classList.remove("idle"); placeBar(); }
  }
  function scheduleIdle(delay) {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!bar) return;
      if (drag || pickerOpen || bar.matches(":hover")) return scheduleIdle(1000);
      bar.classList.add("idle"); placeBar();
    }, delay);
  }

  // ---------- laser glow ----------
  function applyGlow() {
    if (!lcanvas) return;
    const g = state.laserGlow, c = state.color;
    const f = g > 0 ? `drop-shadow(0 0 ${(g * 0.35).toFixed(1)}px ${c}) drop-shadow(0 0 ${g}px ${c})` : "none";
    if (f !== lastGlow) { lastGlow = f; lcanvas.style.filter = f; }
  }

  // ---------- drawing ----------
  function drawItem(c, s) {
    c.save();
    c.lineCap = "round"; c.lineJoin = "round";
    if (s.type === "text") {
      c.fillStyle = s.color; c.font = `${s.size}px sans-serif`; c.textBaseline = "top";
      s.text.split("\n").forEach((line, i) => c.fillText(line, s.x, s.y + i * s.size * 1.2));
    } else {
      c.strokeStyle = s.color; c.lineWidth = s.width;
      if (s.tool === "highlighter") c.globalAlpha = 0.35;
      if (s.tool === "eraser") c.globalCompositeOperation = "destination-out";
      const p = s.pts;
      c.beginPath();
      c.moveTo(p[0][0], p[0][1]);
      if (p.length === 1) c.lineTo(p[0][0] + 0.01, p[0][1]);
      for (let i = 1; i < p.length - 1; i++) {
        const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
        c.quadraticCurveTo(p[i][0], p[i][1], mx, my);   // smooth curve
      }
      if (p.length > 1) c.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
      c.stroke();
    }
    c.restore();
  }

  function visible(st, L, T, R, B) {
    if (st.type === "text") return true;
    if (!st._b) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const q of st.pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
      st._b = [x0, y0, x1, y1];
    }
    const m = st.width + 2, bb = st._b;
    return !(bb[2] + m < L || bb[0] - m > R || bb[3] + m < T || bb[1] - m > B);
  }

  // Strokes/text are stored in page coordinates; the canvas is drawn offset by the current scroll.
  function redraw() {
    const dpr = window.devicePixelRatio || 1, sx = window.scrollX, sy = window.scrollY;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, -sx * dpr, -sy * dpr);
    const L = sx, T = sy, R = sx + innerWidth, B = sy + innerHeight;
    for (const st of state.strokes) if (visible(st, L, T, R, B)) drawItem(ctx, st);
    if (state.current) drawItem(ctx, state.current);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  let scrollQueued = false;
  function onPageScroll() {
    if (!state.open || scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      redraw();
      if (textInput) {                                          // keep the text box glued to the page
        textInput.style.left = (textInput._meta.x - window.scrollX) + "px";
        textInput.style.top = (textInput._meta.y - window.scrollY) + "px";
      }
    });
  }

  // Wheel over the overlay: pass it to the page (so it scrolls / pans / zooms as usual).
  function canScroll(n, dx, dy) {
    const cs = getComputedStyle(n), sc = /(auto|scroll|overlay)/;
    if (dy && sc.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1 &&
        (dy > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0)) return true;
    if (dx && sc.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1 &&
        (dx > 0 ? n.scrollLeft + n.clientWidth < n.scrollWidth - 1 : n.scrollLeft > 0)) return true;
    return false;
  }
  function onWheel(e) {
    if (e.ctrlKey) return;                                      // Ctrl+wheel = browser zoom, leave it alone
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit;
    const target = document.elementsFromPoint(e.clientX, e.clientY).find(el => el !== host) || document.documentElement;
    const synth = new WheelEvent("wheel", {                     // let page scripts (maps, canvas apps) react first
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: e.clientX, clientY: e.clientY, deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode,
      shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey
    });
    target.dispatchEvent(synth);
    if (synth.defaultPrevented) return;
    for (let n = target; n && n !== document.documentElement; n = n.parentElement) {
      if (canScroll(n, dx, dy)) { n.scrollBy(dx, dy); return; }  // nearest scrollable box under the cursor
    }
    window.scrollBy(dx, dy);                                    // otherwise the page itself
  }

  function onDown(e) {
    if (state.tool === "text") { e.preventDefault(); startText(e.clientX, e.clientY); return; }
    if (state.tool === "laser") {          // laser only while left button is held
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      laserDown = true;
      laserCur = [];
      trail.push(laserCur);
      laserPos = [e.clientX, e.clientY];
      laserCur.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      startLaser();
      return;
    }
    commitText();
    canvas.setPointerCapture(e.pointerId);
    const t = state.tool;
    state.current = {
      tool: t, color: state.color,
      width: t === "highlighter" ? state.size * 3 : t === "eraser" ? state.size * 4 : state.size,
      pts: [[e.clientX + window.scrollX, e.clientY + window.scrollY]]
    };
    redraw();
  }
  function onMove(e) {
    if (state.tool === "laser") {
      if (!laserDown) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) addLaserPoint(ev.clientX, ev.clientY);
      laserPos = [e.clientX, e.clientY];
      startLaser();
      return;
    }
    if (!state.current) return;
    state.current.pts.push([e.clientX + window.scrollX, e.clientY + window.scrollY]);
    redraw();
  }
  function onUp() {
    if (laserDown) { laserDown = false; laserCur = null; laserPos = null; return; }  // dot vanishes, trail fades out
    if (!state.current) return;
    state.strokes.push(state.current);
    state.redo = [];
    state.current = null;
    updateHistoryButtons();
    redraw();
  }
  function undo() {
    commitText();
    if (!state.strokes.length) return;
    state.redo.push(state.strokes.pop());
    updateHistoryButtons();
    redraw();
  }
  function redo() {
    commitText();
    if (!state.redo.length) return;
    state.strokes.push(state.redo.pop());
    updateHistoryButtons();
    redraw();
  }

  // ---------- text ----------
  function startText(cx, cy) {
    commitText();
    const x = cx + window.scrollX, y = cy + window.scrollY;   // stored in page coordinates
    const size = state.size * 3 + 12;
    const ta = document.createElement("textarea");
    ta.style.left = cx + "px"; ta.style.top = cy + "px";
    ta.style.fontSize = size + "px"; ta.style.color = state.color;
    ta._meta = { x, y, size, color: state.color };
    ta.addEventListener("keydown", e => {
      e.stopPropagation();                       // keep page shortcuts from firing
      if (e.key === "Escape") { textInput = null; ta.remove(); }
      else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(); }
    });
    ta.addEventListener("blur", () => { if (textInput === ta) commitText(); });
    root.appendChild(ta);
    textInput = ta;
    setTimeout(() => ta.focus(), 0);
  }
  function commitText() {
    if (!textInput) return;
    const ta = textInput; textInput = null;
    const text = ta.value;
    ta.remove();
    if (text.trim()) {
      state.strokes.push({ type: "text", text, ...ta._meta });
      state.redo = [];
      updateHistoryButtons();
      redraw();
    }
  }

  // ---------- laser pointer (Excalidraw-style) ----------
  // Solid thin line, thickest at the head. The tail shrinks and disappears as
  // points age; state.laserFade (ms) controls how long a point lives.
  function startLaser() {
    if (laserRunning) return;
    laserRunning = true;
    requestAnimationFrame(laserFrame);
  }
  function addLaserPoint(x, y) {
    if (!laserCur) return;
    const last = laserCur[laserCur.length - 1];
    if (last && Math.hypot(x - last.x, y - last.y) < 2) return;   // skip jitter -> no hooks/kinks
    laserCur.push({ x, y, t: performance.now() });
    if (laserCur.length > 2000) laserCur.shift();                  // keep drawing cheap on long fades
  }

  function drawLaserStroke(pts, widthOf) {
    const n = pts.length;
    if (n < 2) return;
    let sx = pts[0].x, sy = pts[0].y;
    for (let i = 1; i < n; i++) {
      const p = pts[i], next = pts[i + 1];
      const ex = next ? (p.x + next.x) / 2 : p.x;
      const ey = next ? (p.y + next.y) / 2 : p.y;
      const w0 = widthOf(pts[i - 1]), w1 = widthOf(p);
      const steps = Math.hypot(ex - sx, ey - sy) > 6 ? 5 : 1;
      let px = sx, py = sy;
      for (let k = 1; k <= steps; k++) {
        const t = k / steps, u = 1 - t;
        const x = u * u * sx + 2 * u * t * p.x + t * t * ex;
        const y = u * u * sy + 2 * u * t * p.y + t * t * ey;
        const w = w0 + (w1 - w0) * t;
        if (w > 0.3) {
          lctx.lineWidth = w;
          lctx.beginPath(); lctx.moveTo(px, py); lctx.lineTo(x, y); lctx.stroke();
        }
        px = x; py = y;
      }
      sx = ex; sy = ey;
    }
  }

  function laserFrame() {
    const now = performance.now();
    const fade = state.laserFade;
    applyGlow();
    lctx.clearRect(0, 0, innerWidth, innerHeight);

    // age out points per stroke; drop finished strokes (but keep the one being drawn)
    for (const st of trail) {
      let k = 0;
      while (k < st.length && now - st[k].t >= fade) k++;
      if (k) st.splice(0, k);
    }
    trail = trail.filter(st => st.length > 0 || st === laserCur);

    const base = 2 + state.size * 0.5;                       // thickness follows the size slider
    const widthOf = p => base * Math.pow(Math.max(0, 1 - (now - p.t) / fade), 0.6);
    lctx.lineCap = "round"; lctx.lineJoin = "round";
    lctx.strokeStyle = state.color; lctx.fillStyle = state.color;

    for (const st of trail) drawLaserStroke(st, widthOf);    // each press is its own line -> never joined

    if (laserDown && laserPos) {                             // small round head while the button is held
      lctx.beginPath(); lctx.arc(laserPos[0], laserPos[1], base / 2, 0, Math.PI * 2); lctx.fill();
    }
    if (laserDown || trail.length) requestAnimationFrame(laserFrame);
    else laserRunning = false;
  }

  // ---------- show / hide / keys ----------
  function onKey(e) {
    if (!state.open || textInput) return;
    if (e.key === "Escape") hide();
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
    }
  }
  function show() { if (!host) build(); host.style.display = "block"; state.open = true; updateHistoryButtons(); placeBar(); scheduleIdle(2500); }
  function hide() { commitText(); if (host) host.style.display = "none"; state.open = false; }

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "toggle") state.open ? hide() : show();
  });
})();
