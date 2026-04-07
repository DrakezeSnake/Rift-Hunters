/**
 * Rift Hunters — Phase 0: UI, input, cascade resolution, run flow.
 *
 * Session pacing (GDD ~3–8 min per run): adjust monster scaling in
 * monsterForFloor(), tile damage in data.js TILE_BASE_DAMAGE, and player HP.
 */
(function () {
  const RG = window.RH_GRID;
  const RC = window.RH_COMBAT;
  const RD = window.RH_DATA;

  const CIRC = 2 * Math.PI * 28;

  /** Max duration per type for match clear VFX (sync with match-vfx.css feel). */
  const MATCH_VFX_MS = {
    blade: 520,
    ember: 580,
    tide: 640,
    spark: 500,
    root: 560,
    void: 620,
  };

  /** Pause on empty cells after VFX, before gravity (was ~1s total with instant clear). */
  const MATCH_HOLE_BEAT_MS = 420;

  function maxMatchVfxDurationMs(clearList) {
    let ms = 480;
    for (let i = 0; i < clearList.length; i++) {
      const r = clearList[i][0];
      const c = clearList[i][1];
      const t = state.grid[r][c] && state.grid[r][c].type;
      if (t && MATCH_VFX_MS[t] != null) {
        ms = Math.max(ms, MATCH_VFX_MS[t]);
      }
    }
    return ms;
  }

  function startMatchClearVfx(clearList) {
    const duration = maxMatchVfxDurationMs(clearList);
    if (el.grid) {
      el.grid.classList.add("grid--match-vfx-active");
      window.setTimeout(function () {
        if (el.grid) el.grid.classList.remove("grid--match-vfx-active");
      }, duration + 100);
    }
    for (let i = 0; i < clearList.length; i++) {
      const r = clearList[i][0];
      const c = clearList[i][1];
      const cell = state.grid[r][c];
      if (!cell || !cell.type) continue;
      const t = cell.type;
      if (MATCH_VFX_MS[t] == null) continue;
      const node = el.grid.querySelector(
        '.tile[data-r="' + r + '"][data-c="' + c + '"]'
      );
      if (!node) continue;
      node.classList.add("tile--match-vfx");
      node.classList.add("tile--vfx-" + t);
      const layer = document.createElement("div");
      layer.className = "tile-vfx-layer";
      layer.setAttribute("aria-hidden", "true");
      node.appendChild(layer);
    }
    return duration;
  }

  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let rng = mulberry32(0x9e3779b9);

  const state = {
    grid: null,
    monster: null,
    playerHp: 100,
    playerMaxHp: 100,
    run: { floor: 1, riftCards: [] },
    monsterTimer: 8,
    paused: false,
    lastTs: 0,
  };

  const el = {
    grid: null,
    gridWrap: null,
    monsterPortrait: null,
    monsterShakeWrap: null,
    monsterName: null,
    monsterHpFill: null,
    monsterHpText: null,
    playerHpFill: null,
    playerHpText: null,
    timerRing: null,
    floorPill: null,
    riftStrip: null,
    riftOverlay: null,
    riftCardRow: null,
    gameOverOverlay: null,
    gameOverTitle: null,
    gameOverDetail: null,
    btnRestart: null,
  };

  let pointerDown = null;
  /** Two-tap swap: first tap selects; second tap on adjacent tile swaps. */
  let selectedRc = null;
  let animating = false;
  let monsterStrikeClearTimer = null;

  const MONSTER_ELEM_TYPES = [
    "blade",
    "ember",
    "tide",
    "spark",
    "root",
    "void",
  ];

  function clearMonsterPortraitStrikeClasses() {
    if (!el.monsterPortrait) return;
    const p = el.monsterPortrait;
    p.classList.remove("monster-strike-active");
    for (let i = 0; i < MONSTER_ELEM_TYPES.length; i++) {
      p.classList.remove("monster-elem-" + MONSTER_ELEM_TYPES[i]);
    }
  }

  function dominantTileTypeFromWave(tiles) {
    const counts = {};
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i].type;
      if (!t) continue;
      counts[t] = (counts[t] || 0) + 1;
    }
    let best = null;
    let max = 0;
    const keys = Object.keys(counts);
    for (let k = 0; k < keys.length; k++) {
      const t = keys[k];
      if (counts[t] > max) {
        max = counts[t];
        best = t;
      }
    }
    return best;
  }

  function triggerMonsterShake() {
    const w = el.monsterShakeWrap;
    if (!w) return;
    w.classList.remove("monster-shaking");
    void w.offsetWidth;
    w.classList.add("monster-shaking");
    window.setTimeout(function () {
      w.classList.remove("monster-shaking");
    }, 460);
  }

  /** Elemental burst on portrait; HP should already be updated for this wave. */
  function playMonsterElementalStrike(tiles, damage) {
    if (!el.monsterPortrait || damage <= 0) return;
    triggerMonsterShake();
    const elType = dominantTileTypeFromWave(tiles);
    if (!elType || MONSTER_ELEM_TYPES.indexOf(elType) < 0) return;
    if (monsterStrikeClearTimer !== null) {
      window.clearTimeout(monsterStrikeClearTimer);
      monsterStrikeClearTimer = null;
    }
    clearMonsterPortraitStrikeClasses();
    void el.monsterPortrait.offsetWidth;
    el.monsterPortrait.classList.add("monster-strike-active");
    el.monsterPortrait.classList.add("monster-elem-" + elType);
    monsterStrikeClearTimer = window.setTimeout(function () {
      monsterStrikeClearTimer = null;
      clearMonsterPortraitStrikeClasses();
    }, 480);
  }

  function removeDragGhost() {
    if (pointerDown && pointerDown.ghost && pointerDown.ghost.parentNode) {
      pointerDown.ghost.parentNode.removeChild(pointerDown.ghost);
    }
    if (pointerDown) {
      pointerDown.ghost = null;
    }
    el.grid.querySelectorAll(".tile--drag-source").forEach(function (n) {
      n.classList.remove("tile--drag-source");
    });
  }

  function clearDropTargets() {
    el.grid.querySelectorAll(".tile--drop-target").forEach(function (n) {
      n.classList.remove("tile--drop-target");
    });
  }

  function showDragGhost(tileEl, clientX, clientY) {
    removeDragGhost();
    const rect = tileEl.getBoundingClientRect();
    const wrap = document.createElement("div");
    wrap.className = "tile-drag-ghost";
    wrap.style.width = rect.width + "px";
    wrap.style.height = rect.height + "px";
    wrap.style.left = clientX - rect.width / 2 + "px";
    wrap.style.top = clientY - rect.height / 2 + "px";
    const inner = tileEl.cloneNode(true);
    inner.classList.remove("selected", "tile--drag-source", "tile--drop-target");
    inner.removeAttribute("id");
    wrap.appendChild(inner);
    document.body.appendChild(wrap);
    return {
      el: wrap,
      w: rect.width,
      h: rect.height,
    };
  }

  function resolveAssetUrl(relativePath) {
    if (
      !relativePath ||
      relativePath.indexOf("data:") === 0 ||
      relativePath.indexOf("blob:") === 0
    ) {
      return relativePath;
    }
    const parts = String(relativePath).split("/");
    const encoded = parts.map(function (seg) {
      return encodeURIComponent(seg);
    }).join("/");
    try {
      return new URL(encoded, window.location.href).href;
    } catch (err) {
      return relativePath;
    }
  }

  function configureTileImage(img, type, labelEl) {
    const urls = RD.ASSETS.tileUrlCandidates(type);
    let idx = 0;
    function tryNext() {
      if (idx >= urls.length) {
        img.onload = null;
        img.onerror = null;
        img.remove();
        return;
      }
      img.onerror = function () {
        idx += 1;
        tryNext();
      };
      img.onload = function () {
        labelEl.style.display = "none";
      };
      img.src = resolveAssetUrl(urls[idx]);
    }
    tryNext();
  }

  function configurePortraitImage(img, portraitId) {
    const urls = RD.ASSETS.monsterUrlCandidates(portraitId || "default");
    let idx = 0;
    function tryNext() {
      if (idx >= urls.length) {
        img.onload = null;
        img.onerror = null;
        img.remove();
        return;
      }
      img.onerror = function () {
        idx += 1;
        tryNext();
      };
      img.src = resolveAssetUrl(urls[idx]);
    }
    tryNext();
  }

  function configureRiftCardImage(img, cardId) {
    const urls = RD.ASSETS.riftCardUrlCandidates(cardId);
    let idx = 0;
    function tryNext() {
      if (idx >= urls.length) {
        img.onload = null;
        img.onerror = null;
        img.remove();
        return;
      }
      img.onerror = function () {
        idx += 1;
        tryNext();
      };
      img.onload = function () {
        img.style.display = "";
      };
      img.src = resolveAssetUrl(urls[idx]);
    }
    img.style.display = "none";
    tryNext();
  }

  function snapshotColumnStacks(grid) {
    const cols = [];
    for (let c = 0; c < RG.COLS; c++) {
      const stack = [];
      for (let r = RG.ROWS - 1; r >= 0; r--) {
        if (grid[r][c].type !== null) {
          stack.push({
            r: r,
            type: grid[r][c].type,
            special: grid[r][c].special,
          });
        }
      }
      cols.push(stack);
    }
    return cols;
  }

  /**
   * Runs gravity; returns Map(cellKey -> rows fallen) for final tile positions.
   */
  function computeGravityFallMap(grid) {
    const before = snapshotColumnStacks(grid);
    RG.applyGravity(grid);
    const after = snapshotColumnStacks(grid);
    const map = new Map();
    for (let c = 0; c < RG.COLS; c++) {
      const a = before[c];
      const b = after[c];
      if (a.length !== b.length) {
        continue;
      }
      for (let i = 0; i < a.length; i++) {
        const dr = b[i].r - a[i].r;
        if (dr > 0) {
          map.set(RG.cellKey(b[i].r, c), dr);
        }
      }
    }
    return map;
  }

  function fillEmptyWithFallDistances(grid, fallMap) {
    for (let c = 0; c < RG.COLS; c++) {
      for (let r = 0; r < RG.ROWS; r++) {
        if (grid[r][c].type === null) {
          const t = RG.pickTileNoAutoMatch(
            grid,
            r,
            c,
            rng,
            RD.TILE_SPAWN_WEIGHTS
          );
          grid[r][c] = RG.createCell(t, null);
          const k = RG.cellKey(r, c);
          const drop = RG.ROWS - r;
          const prev = fallMap.get(k) || 0;
          fallMap.set(k, Math.max(prev, drop));
        }
      }
    }
  }

  function getTileStepPx() {
    const t = el.grid.querySelector(".tile[data-type]");
    if (!t) {
      const any = el.grid.querySelector(".tile");
      if (!any) return 48;
      const r = any.getBoundingClientRect();
      const g = window.getComputedStyle(el.grid);
      const gap = parseFloat(g.gap || g.rowGap || "4") || 4;
      return r.height + gap;
    }
    const r = t.getBoundingClientRect();
    const g = window.getComputedStyle(el.grid);
    const gap = parseFloat(g.gap || g.rowGap || "4") || 4;
    return r.height + gap;
  }

  /** ease-out–heavy landing (aligns with snappy UI motion); duration scales with fall rows. */
  const FALL_EASE = "cubic-bezier(0.22, 1, 0.32, 1)";

  function fallDurationMs(rows) {
    const r = Math.max(1, rows);
    return Math.min(320, Math.round(95 + r * 36));
  }

  function runFallAnimation(fallMap, then) {
    if (!fallMap || fallMap.size === 0) {
      then();
      return;
    }
    const step = getTileStepPx();
    const entries = [];
    let maxMs = 0;
    fallMap.forEach(function (rows, key) {
      if (rows <= 0) return;
      const p = key.split(",");
      const r = +p[0];
      const c = +p[1];
      const node = el.grid.querySelector(
        '.tile[data-r="' + r + '"][data-c="' + c + '"]'
      );
      if (!node || !node.dataset.type) return;
      const ms = fallDurationMs(rows);
      maxMs = Math.max(maxMs, ms);
      node.style.transition = "none";
      node.style.transform = "translateY(" + -rows * step + "px)";
      entries.push({ node: node, ms: ms });
    });
    if (entries.length === 0) {
      then();
      return;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          const s = e.ms / 1000;
          e.node.style.transition =
            "transform " + s + "s " + FALL_EASE;
          e.node.style.transform = "translateY(0)";
        }
        window.setTimeout(function () {
          for (let j = 0; j < entries.length; j++) {
            const n = entries[j].node;
            n.style.transition = "";
            n.style.transform = "";
          }
          then();
        }, maxMs + 45);
      });
    });
  }

  function resolveCascadeAnimated(onComplete) {
    let cascadeIndex = 0;

    function waveStep() {
      if (state.paused) return;
      const matchCells = RG.findMatchCells(state.grid);
      if (matchCells.length === 0) {
        onComplete({ waveCount: cascadeIndex });
        return;
      }

      const clearList = RG.buildClearSet(state.grid, matchCells);
      const keySet = new Set();
      for (let i = 0; i < clearList.length; i++) {
        keySet.add(RG.cellKey(clearList[i][0], clearList[i][1]));
      }
      const specialSpawn = RG.pickSpecialSpawn(state.grid, keySet);

      const tiles = [];
      for (let i = 0; i < clearList.length; i++) {
        const r = clearList[i][0];
        const c = clearList[i][1];
        const cell = state.grid[r][c];
        tiles.push({
          r: r,
          c: c,
          type: cell.type,
          special: cell.special,
        });
      }

      const wave = { tiles: tiles, cascadeIndex: cascadeIndex };
      const res = RC.resolveWaveDamage(state, wave);

      const vfxMs = startMatchClearVfx(clearList);
      window.setTimeout(function () {
        if (state.paused) return;
        for (let i = 0; i < clearList.length; i++) {
          const r = clearList[i][0];
          const c = clearList[i][1];
          state.grid[r][c] = RG.createCell(null, null);
        }
        if (specialSpawn) {
          state.grid[specialSpawn.r][specialSpawn.c] = RG.createCell(
            specialSpawn.type,
            specialSpawn.special
          );
        }

        renderGrid();

        window.setTimeout(function () {
          if (state.paused) return;
          const fallMap = computeGravityFallMap(state.grid);
          fillEmptyWithFallDistances(state.grid, fallMap);
          renderGrid();
          runFallAnimation(fallMap, function () {
            if (state.paused) return;
            state.monster.hp -= res.damage;
            state.playerHp = Math.min(
              state.playerMaxHp,
              state.playerHp + res.heal
            );
            if (res.damage > 0) {
              state.monsterTimer = Math.min(
                state.monsterTimer + 0.5,
                state.monster.attackTimerMax
              );
            }
            playMonsterElementalStrike(tiles, res.damage);
            updateHud();
            if (state.monster.hp <= 0) {
              state.monster.hp = 0;
              state.paused = true;
              updateHud();
              openRiftPick();
              animating = false;
              return;
            }
            cascadeIndex += 1;
            window.setTimeout(waveStep, 50);
          });
        }, MATCH_HOLE_BEAT_MS);
      }, vfxMs);
    }

    waveStep();
  }

  function animateSwapVisual(r1, c1, r2, c2, done) {
    const tileA = el.grid.querySelector(
      '.tile[data-r="' + r1 + '"][data-c="' + c1 + '"]'
    );
    const tileB = el.grid.querySelector(
      '.tile[data-r="' + r2 + '"][data-c="' + c2 + '"]'
    );
    if (!tileA || !tileB) {
      done();
      return;
    }

    const ar = tileA.getBoundingClientRect();
    const br = tileB.getBoundingClientRect();
    const acx = ar.left + ar.width / 2;
    const acy = ar.top + ar.height / 2;
    const bcx = br.left + br.width / 2;
    const bcy = br.top + br.height / 2;
    const dxA = bcx - acx;
    const dyA = bcy - acy;
    const dxB = acx - bcx;
    const dyB = acy - bcy;

    tileA.classList.add("tile--swap-anim");
    tileB.classList.add("tile--swap-anim");

    requestAnimationFrame(function () {
      tileA.style.transform = "translate(" + dxA + "px," + dyA + "px)";
      tileB.style.transform = "translate(" + dxB + "px," + dyB + "px)";
    });

    window.setTimeout(function () {
      tileA.classList.remove("tile--swap-anim");
      tileB.classList.remove("tile--swap-anim");
      tileA.style.transform = "";
      tileB.style.transform = "";
      done();
    }, 240);
  }

  /** HP/timer/heal and portrait strikes are applied per cascade wave in resolveCascadeAnimated. */
  function applyCombatAfterResolve(_res) {
    updateHud();
    if (state.monster.hp <= 0) {
      state.monster.hp = 0;
      if (!state.paused) {
        state.paused = true;
        openRiftPick();
      }
    }
  }

  function monsterForFloor(floor) {
    const hp = Math.floor(180 + ((floor - 1) * (4200 - 180)) / 11);
    const attackTimerMax = Math.max(3.2, 8 - (floor - 1) * 0.45);
    const attackDamage = Math.floor(10 + floor * 2);
    return {
      name: "Ash Whelp",
      hp: hp,
      maxHp: hp,
      affinityKey: "fire",
      attackTimerMax: attackTimerMax,
      attackDamage: attackDamage,
      portraitId: "default",
    };
  }

  function ensurePlayableGrid() {
    let guard = 0;
    do {
      state.grid = RG.createInitialGrid(rng, RD.TILE_SPAWN_WEIGHTS);
      guard++;
    } while (RG.findMatchCells(state.grid).length > 0 && guard < 80);
  }

  function trySwap(r1, c1, r2, c2) {
    selectedRc = null;
    const grid = state.grid;
    animating = true;
    animateSwapVisual(r1, c1, r2, c2, function () {
      RG.swapCells(grid, r1, c1, r2, c2);
      renderGrid();
      if (RG.findMatchCells(grid).length === 0) {
        animateSwapVisual(r1, c1, r2, c2, function () {
          RG.swapCells(grid, r1, c1, r2, c2);
          renderGrid();
          el.grid.classList.add("shake");
          window.setTimeout(function () {
            el.grid.classList.remove("shake");
            animating = false;
          }, 280);
        });
        return;
      }
      resolveCascadeAnimated(function (res) {
        applyCombatAfterResolve(res);
        animating = false;
      });
    });
  }

  function tileLabel(type) {
    const map = {
      blade: "Bd",
      ember: "Em",
      tide: "Ti",
      spark: "Sp",
      root: "Rt",
      void: "Vo",
    };
    return map[type] || "?";
  }

  function renderGrid() {
    el.grid.innerHTML = "";
    const g = state.grid;
    for (let r = 0; r < RG.ROWS; r++) {
      for (let c = 0; c < RG.COLS; c++) {
        const cell = g[r][c];
        const div = document.createElement("div");
        div.className = "tile";
        div.dataset.r = String(r);
        div.dataset.c = String(c);
        if (
          selectedRc &&
          selectedRc.r === r &&
          selectedRc.c === c
        ) {
          div.classList.add("selected");
        }
        if (!cell.type) {
          div.classList.add("tile--hole");
        } else {
          div.dataset.type = cell.type;
          if (cell.special) div.dataset.special = cell.special;
          const img = document.createElement("img");
          img.className = "tile-art";
          img.alt = "";
          img.draggable = false;
          const label = document.createElement("span");
          label.className = "tile-label";
          label.textContent = tileLabel(cell.type);
          div.appendChild(img);
          div.appendChild(label);
          configureTileImage(img, cell.type, label);
          if (cell.special === "power") {
            const m = document.createElement("span");
            m.className = "mark";
            m.textContent = "P";
            div.appendChild(m);
          } else if (cell.special === "rift") {
            const m = document.createElement("span");
            m.className = "mark";
            m.textContent = "R";
            div.appendChild(m);
          }
        }
        el.grid.appendChild(div);
      }
    }
  }

  function updateHud() {
    const m = state.monster;
    el.monsterName.textContent = m.name;
    if (el.monsterPortrait) {
      el.monsterPortrait.innerHTML = "";
      const mp = document.createElement("img");
      mp.alt = "";
      mp.draggable = false;
      el.monsterPortrait.appendChild(mp);
      configurePortraitImage(mp, m.portraitId || "default");
    }
    const mp = m.maxHp > 0 ? m.hp / m.maxHp : 0;
    el.monsterHpFill.style.transform = "scaleX(" + Math.max(0, mp) + ")";
    el.monsterHpText.textContent = Math.max(0, Math.floor(m.hp)) + " / " + m.maxHp;

    const pp = state.playerHp / state.playerMaxHp;
    el.playerHpFill.style.transform = "scaleX(" + Math.max(0, pp) + ")";
    el.playerHpText.textContent =
      Math.max(0, Math.floor(state.playerHp)) + " / " + state.playerMaxHp;

    const maxT = m.attackTimerMax;
    const prog = maxT > 0 ? state.monsterTimer / maxT : 0;
    el.timerRing.style.strokeDashoffset = String(CIRC * (1 - Math.max(0, Math.min(1, prog))));

    el.floorPill.textContent = "Floor " + state.run.floor;

    el.riftStrip.innerHTML = "";
    const cards = state.run.riftCards;
    for (let i = 0; i < cards.length; i++) {
      const def = RD.RIFT_CARD_DEFS[cards[i]];
      if (!def) continue;
      const chip = document.createElement("span");
      chip.className = "rift-chip";
      chip.textContent = def.name;
      el.riftStrip.appendChild(chip);
    }
  }

  function gameLoop(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(0.05, (ts - state.lastTs) / 1000);
    state.lastTs = ts;

    if (!state.paused && state.monster && state.monster.hp > 0) {
      const spd = RC.timerSpeedMultiplier(state);
      state.monsterTimer -= dt * spd;
      if (state.monsterTimer <= 0) {
        state.monsterTimer = 0;
        const dmg = RC.monsterDamageToPlayer(state, state.monster.attackDamage);
        state.playerHp -= dmg;
        state.monsterTimer = state.monster.attackTimerMax;
        updateHud();
        if (state.playerHp <= 0) {
          state.playerHp = 0;
          state.paused = true;
          openGameOver(false);
        }
      }
      el.timerRing.style.strokeDashoffset = String(
        CIRC *
          (1 -
            Math.max(
              0,
              Math.min(1, state.monsterTimer / state.monster.attackTimerMax)
            ))
      );
    }

    requestAnimationFrame(gameLoop);
  }

  function shuffleInPlace(arr, r) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function openRiftPick() {
    if (el.riftOverlay && !el.riftOverlay.classList.contains("hidden")) {
      return;
    }
    const pool = ["ember_core", "frozen_clockwork", "bloodpact"];
    const pick = shuffleInPlace(pool.slice(), rng);
    el.riftCardRow.innerHTML = "";
    for (let i = 0; i < pick.length; i++) {
      const id = pick[i];
      const def = RD.RIFT_CARD_DEFS[id];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rift-card-btn";
      const art = document.createElement("img");
      art.className = "rift-card-art";
      art.alt = "";
      art.draggable = false;
      const textCol = document.createElement("div");
      textCol.className = "rift-card-text";
      textCol.innerHTML =
        '<div class="name">' +
        def.name +
        '</div><div class="desc">' +
        def.description +
        "</div>";
      btn.appendChild(art);
      btn.appendChild(textCol);
      configureRiftCardImage(art, id);
      btn.addEventListener("click", function () {
        state.run.riftCards.push(id);
        el.riftOverlay.classList.add("hidden");
        el.riftOverlay.setAttribute("aria-hidden", "true");
        state.run.floor++;
        state.monster = monsterForFloor(state.run.floor);
        state.monsterTimer = state.monster.attackTimerMax;
        selectedRc = null;
        ensurePlayableGrid();
        renderGrid();
        updateHud();
        state.paused = false;
      });
      el.riftCardRow.appendChild(btn);
    }
    el.riftOverlay.classList.remove("hidden");
    el.riftOverlay.setAttribute("aria-hidden", "false");
  }

  function openGameOver(won) {
    el.gameOverTitle.textContent = won ? "Victory" : "Defeated";
    el.gameOverDetail.textContent = won
      ? "Run complete."
      : "Floor " +
        state.run.floor +
        " — tap New run to try again.";
    el.gameOverOverlay.classList.remove("hidden");
    el.gameOverOverlay.setAttribute("aria-hidden", "false");
  }

  function resetRun() {
    rng = mulberry32(Date.now() & 0xffffffff);
    state.run = { floor: 1, riftCards: [] };
    state.playerHp = 100;
    state.playerMaxHp = 100;
    state.monster = monsterForFloor(1);
    state.monsterTimer = state.monster.attackTimerMax;
    state.paused = false;
    selectedRc = null;
    ensurePlayableGrid();
    renderGrid();
    updateHud();
    el.gameOverOverlay.classList.add("hidden");
    el.gameOverOverlay.setAttribute("aria-hidden", "true");
  }

  function cellFromTarget(t) {
    const node = t && t.closest ? t.closest(".tile") : null;
    if (!node || !node.dataset) return null;
    return {
      r: +node.dataset.r,
      c: +node.dataset.c,
    };
  }

  /** Measured from DOM so clamp() tile size and grid gaps stay correct. */
  function getGridStepGeometry() {
    const t00 = el.grid.querySelector('.tile[data-r="0"][data-c="0"]');
    const t01 = el.grid.querySelector('.tile[data-r="0"][data-c="1"]');
    const t10 = el.grid.querySelector('.tile[data-r="1"][data-c="0"]');
    if (!t00 || !t01 || !t10) return null;
    const r00 = t00.getBoundingClientRect();
    const r01 = t01.getBoundingClientRect();
    const r10 = t10.getBoundingClientRect();
    const cellW = r00.width;
    const cellH = r00.height;
    const gapX = r01.left - r00.right;
    const gapY = r10.top - r00.bottom;
    return {
      originX: r00.left,
      originY: r00.top,
      stepX: cellW + gapX,
      stepY: cellH + gapY,
      cellW: cellW,
      cellH: cellH,
      gapX: gapX,
      gapY: gapY,
    };
  }

  /**
   * When the finger is in the grid gutter, elementFromPoint hits #grid, not a tile.
   * Map (x,y) to the nearest cell using layout math + extra slack for human touch.
   */
  function nearestCellByGridMetrics(x, y) {
    const g = getGridStepGeometry();
    if (!g) return null;
    const bounds = el.grid.getBoundingClientRect();
    const margin = 28;
    if (
      x < bounds.left - margin ||
      x > bounds.right + margin ||
      y < bounds.top - margin ||
      y > bounds.bottom + margin
    ) {
      return null;
    }
    let br = 0;
    let bc = 0;
    let best = Infinity;
    for (let r = 0; r < RG.ROWS; r++) {
      for (let c = 0; c < RG.COLS; c++) {
        const cx = g.originX + c * g.stepX + g.cellW * 0.5;
        const cy = g.originY + r * g.stepY + g.cellH * 0.5;
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d < best) {
          best = d;
          br = r;
          bc = c;
        }
      }
    }
    const slack = 14;
    const maxDist = Math.hypot(
      g.cellW * 0.5 + g.gapX * 0.5 + slack,
      g.cellH * 0.5 + g.gapY * 0.5 + slack
    );
    if (Math.sqrt(best) > maxDist) return null;
    return { r: br, c: bc };
  }

  function resolveCellAtClient(x, y) {
    const node = document.elementFromPoint(x, y);
    const hit = cellFromTarget(node);
    if (hit) return hit;
    return nearestCellByGridMetrics(x, y);
  }

  /**
   * Infer which adjacent neighbor (one step) the user meant from overall motion.
   * @param {number} [minTravelPx] — default 16; use higher when end cell is far (avoid accidental swaps).
   */
  function adjacentCellFromPointerMotion(r0, c0, x0, y0, x1, y1, minTravelPx) {
    const minT = minTravelPx != null ? minTravelPx : 16;
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (Math.hypot(dx, dy) < minT) return null;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx >= ady) {
      const nc = c0 + (dx > 0 ? 1 : -1);
      if (nc >= 0 && nc < RG.COLS) return { r: r0, c: nc };
    } else {
      const nr = r0 + (dy > 0 ? 1 : -1);
      if (nr >= 0 && nr < RG.ROWS) return { r: nr, c: c0 };
    }
    return null;
  }

  function releasePointerIfAny(e) {
    try {
      if (
        el.grid &&
        typeof el.grid.hasPointerCapture === "function" &&
        el.grid.hasPointerCapture(e.pointerId)
      ) {
        el.grid.releasePointerCapture(e.pointerId);
      }
    } catch (err) {
      /* ignore */
    }
  }

  function onPointerDown(e) {
    if (state.paused || animating) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const tileEl = e.target.closest(".tile");
    if (!tileEl || tileEl.dataset.r === undefined) return;
    const r = +tileEl.dataset.r;
    const c = +tileEl.dataset.c;
    if (!state.grid[r][c].type) return;
    const ghostPack = showDragGhost(tileEl, e.clientX, e.clientY);
    pointerDown = {
      r: r,
      c: c,
      id: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      ghost: ghostPack.el,
      ghostW: ghostPack.w,
      ghostH: ghostPack.h,
    };
    tileEl.classList.add("tile--drag-source");
    try {
      el.grid.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
  }

  function onPointerMove(e) {
    if (!pointerDown || pointerDown.id !== e.pointerId) return;
    if (pointerDown.ghost) {
      pointerDown.ghost.style.left =
        e.clientX - pointerDown.ghostW / 2 + "px";
      pointerDown.ghost.style.top =
        e.clientY - pointerDown.ghostH / 2 + "px";
    }
    clearDropTargets();
    if (animating || state.paused) return;
    const cell = resolveCellAtClient(e.clientX, e.clientY);
    if (!cell || !state.grid[cell.r][cell.c].type) return;
    const dr = Math.abs(cell.r - pointerDown.r);
    const dc = Math.abs(cell.c - pointerDown.c);
    if (dr + dc !== 1) return;
    const node = el.grid.querySelector(
      '.tile[data-r="' + cell.r + '"][data-c="' + cell.c + '"]'
    );
    if (node) node.classList.add("tile--drop-target");
  }

  function onPointerUp(e) {
    if (!pointerDown || pointerDown.id !== e.pointerId) {
      return;
    }
    const start = pointerDown;
    const ghost = start.ghost;
    pointerDown = null;
    releasePointerIfAny(e);
    if (ghost && ghost.parentNode) {
      ghost.parentNode.removeChild(ghost);
    }
    el.grid.querySelectorAll(".tile--drag-source").forEach(function (n) {
      n.classList.remove("tile--drag-source");
    });
    clearDropTargets();

    let end =
      resolveCellAtClient(e.clientX, e.clientY) ||
      cellFromTarget(e.target);

    if (!end || !state.grid[end.r][end.c].type) {
      const adj = adjacentCellFromPointerMotion(
        start.r,
        start.c,
        start.clientX,
        start.clientY,
        e.clientX,
        e.clientY
      );
      if (adj && state.grid[adj.r][adj.c].type) {
        end = adj;
      }
    }
    if (!end || !state.grid[end.r][end.c].type) {
      return;
    }

    if (
      end.r === start.r &&
      end.c === start.c &&
      Math.hypot(
        e.clientX - start.clientX,
        e.clientY - start.clientY
      ) >= 18
    ) {
      const adj = adjacentCellFromPointerMotion(
        start.r,
        start.c,
        start.clientX,
        start.clientY,
        e.clientX,
        e.clientY
      );
      if (adj && state.grid[adj.r][adj.c].type) {
        end = adj;
      }
    }
    if (!state.grid[start.r][start.c].type) {
      return;
    }

    const diffRow = start.r !== end.r || start.c !== end.c;

    if (diffRow) {
      const dr = Math.abs(end.r - start.r);
      const dc = Math.abs(end.c - start.c);
      if (!animating) {
        if (dr + dc === 1) {
          trySwap(start.r, start.c, end.r, end.c);
        } else {
          /* Match-3 only swaps adjacent tiles. Long drags that end on a distant
             tile still pick the immediate neighbor along the dominant drag axis
             (e.g. drag down three rows → swap with the tile directly below). */
          const adj = adjacentCellFromPointerMotion(
            start.r,
            start.c,
            start.clientX,
            start.clientY,
            e.clientX,
            e.clientY,
            22
          );
          if (adj && state.grid[adj.r][adj.c].type) {
            trySwap(start.r, start.c, adj.r, adj.c);
          }
        }
      }
      return;
    }

    /* Same-cell release: two-tap selection / swap */
    if (selectedRc && selectedRc.r === start.r && selectedRc.c === start.c) {
      selectedRc = null;
      renderGrid();
      return;
    }
    if (selectedRc) {
      const dr = Math.abs(selectedRc.r - start.r);
      const dc = Math.abs(selectedRc.c - start.c);
      if (dr + dc === 1 && !animating) {
        trySwap(selectedRc.r, selectedRc.c, start.r, start.c);
      } else {
        selectedRc = { r: start.r, c: start.c };
        renderGrid();
      }
      return;
    }
    selectedRc = { r: start.r, c: start.c };
    renderGrid();
  }

  function onPointerCancel(e) {
    if (pointerDown && pointerDown.id === e.pointerId) {
      const ghost = pointerDown.ghost;
      pointerDown = null;
      releasePointerIfAny(e);
      if (ghost && ghost.parentNode) {
        ghost.parentNode.removeChild(ghost);
      }
      el.grid.querySelectorAll(".tile--drag-source").forEach(function (n) {
        n.classList.remove("tile--drag-source");
      });
      clearDropTargets();
    }
  }

  function init() {
    el.grid = document.getElementById("grid");
    el.gridWrap = document.getElementById("gridWrap");
    el.monsterPortrait = document.getElementById("monsterPortrait");
    el.monsterShakeWrap = document.getElementById("monsterShakeWrap");
    el.monsterName = document.getElementById("monsterName");
    el.monsterHpFill = document.getElementById("monsterHpFill");
    el.monsterHpText = document.getElementById("monsterHpText");
    el.playerHpFill = document.getElementById("playerHpFill");
    el.playerHpText = document.getElementById("playerHpText");
    el.timerRing = document.getElementById("timerRing");
    el.floorPill = document.getElementById("floorPill");
    el.riftStrip = document.getElementById("riftStrip");
    el.riftOverlay = document.getElementById("riftOverlay");
    el.riftCardRow = document.getElementById("riftCardRow");
    el.gameOverOverlay = document.getElementById("gameOverOverlay");
    el.gameOverTitle = document.getElementById("gameOverTitle");
    el.gameOverDetail = document.getElementById("gameOverDetail");
    el.btnRestart = document.getElementById("btnRestart");

    el.grid.addEventListener("pointerdown", onPointerDown);
    el.grid.addEventListener("pointermove", onPointerMove);
    el.grid.addEventListener("pointerup", onPointerUp);
    el.grid.addEventListener("pointercancel", onPointerCancel);
    el.grid.addEventListener("lostpointercapture", onPointerCancel);

    el.btnRestart.addEventListener("click", resetRun);

    resetRun();
    requestAnimationFrame(gameLoop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
