/**
 * Rift Hunters — data definitions (monsters, tiles, affinity, Rift Cards).
 */
(function () {
  const TILE_TYPES = ["blade", "ember", "tide", "spark", "root", "void", "divine"];

  /** Base damage per matched tile (before multipliers). Tuned for Phase 0. */
  const TILE_BASE_DAMAGE = {
    blade: 12,
    ember: 8,
    tide: 10,
    spark: 9,
    root: 6,
    void: 22,
    divine: 11,
  };

  /**
   * Spawn weights (void is rare per GDD).
   */
  const TILE_SPAWN_WEIGHTS = {
    blade: 22,
    ember: 22,
    tide: 22,
    spark: 22,
    root: 22,
    void: 5,
    divine: 4,
  };

  const ELEMENT_BEATS = {
    ember: ["root"],
    tide: ["ember"],
    root: ["spark"],
    void: ["divine"],
    divine: ["void"],
  };

  const STRONG_MULT = 2;
  const WEAK_TAKEN_MULT = 2;

  /**
   * Cascade damage multiplier: each wave uses 1.5 ** cascadeIndex
   * (first resolution wave index 0 → ×1, first cascade index 1 → ×1.5, …).
   * See combat.js for the authoritative comment.
   */
  const CASCADE_MULT_BASE = 1.5;

  function pickWeightedTile(rng, weights) {
    const entries = Object.entries(weights);
    let total = 0;
    for (let i = 0; i < entries.length; i++) total += entries[i][1];
    let r = rng() * total;
    for (let i = 0; i < entries.length; i++) {
      r -= entries[i][1];
      if (r <= 0) return entries[i][0];
    }
    return entries[entries.length - 1][0];
  }

  /**
   * Rift Card definitions — hooks return patches to combat/grid context.
   */
  const RIFT_CARD_DEFS = {
    ember_core: {
      id: "ember_core",
      name: "Ember Core",
      type: "offense",
      description:
        "Fire tiles deal splash: +25% of their damage as bonus when Ember matches.",
      hooks: {
        afterWaveDamage(ctx) {
          const cm = ctx.cascadeMult != null ? ctx.cascadeMult : 1;
          let bonus = 0;
          for (let i = 0; i < ctx.tiles.length; i++) {
            const t = ctx.tiles[i];
            if (t.type === "ember") {
              bonus += Math.floor(TILE_BASE_DAMAGE.ember * 0.25 * cm);
            }
          }
          return bonus;
        },
      },
    },
    frozen_clockwork: {
      id: "frozen_clockwork",
      name: "Frozen Clockwork",
      type: "defense",
      description: "Monster attack timer runs 50% slower.",
      hooks: {
        timerSpeedMultiplier() {
          return 0.5;
        },
      },
    },
    bloodpact: {
      id: "bloodpact",
      name: "Bloodpact",
      type: "chaos",
      description: "You deal double damage but take double damage from the monster.",
      hooks: {
        playerOutgoingDamageMult() {
          return 2;
        },
        monsterOutgoingDamageMult() {
          return 2;
        },
      },
    },
  };

  /**
   * Tries flat assets/tiles/ first (common on disk), then assets/images/tiles/.
   * See assets/IMAGES.txt.
   */
  const ASSET_EXTS = [".png", ".webp", ".jpg", ".jpeg"];

  function urlCandidates(subfolder, baseName) {
    const out = [];
    for (let i = 0; i < ASSET_EXTS.length; i++) {
      out.push("assets/images/" + subfolder + "/" + baseName + ASSET_EXTS[i]);
    }
    return out;
  }

  function tileFileUrlsForBaseName(baseName) {
    const folders = ["assets/tiles", "assets/images/tiles"];
    const out = [];
    for (let f = 0; f < folders.length; f++) {
      for (let i = 0; i < ASSET_EXTS.length; i++) {
        out.push(folders[f] + "/" + baseName + ASSET_EXTS[i]);
      }
    }
    return out;
  }

  function riftCardFileUrlsForBaseName(baseName) {
    const folders = ["assets/rift-cards", "assets/images/rift-cards"];
    const out = [];
    for (let f = 0; f < folders.length; f++) {
      for (let i = 0; i < ASSET_EXTS.length; i++) {
        out.push(folders[f] + "/" + baseName + ASSET_EXTS[i]);
      }
    }
    return out;
  }

  function hunterFileUrlsForBaseName(baseName) {
    const folders = [
      "assets/Hunters",
      "assets/hunters",
      "assets/images/hunters",
    ];
    const out = [];
    for (let f = 0; f < folders.length; f++) {
      for (let i = 0; i < ASSET_EXTS.length; i++) {
        out.push(folders[f] + "/" + baseName + ASSET_EXTS[i]);
      }
    }
    return out;
  }

  function riftCardUrlCandidatesInner(cardId) {
    const id = String(cardId || "");
    const lower = id.toLowerCase();
    const names = [];
    if (lower) names.push(lower);
    if (id && id !== lower) names.push(id);
    const seen = {};
    const out = [];
    for (let n = 0; n < names.length; n++) {
      if (seen[names[n]]) continue;
      seen[names[n]] = true;
      const part = riftCardFileUrlsForBaseName(names[n]);
      for (let i = 0; i < part.length; i++) {
        out.push(part[i]);
      }
    }
    return out;
  }

  function hunterUrlCandidatesInner(hunterId) {
    const id = String(hunterId || "").trim();
    const lower = id.toLowerCase();
    const names = [];
    if (id) names.push(id);
    if (lower && lower !== id) names.push(lower);
    const seen = {};
    const out = [];
    for (let n = 0; n < names.length; n++) {
      if (seen[names[n]]) continue;
      seen[names[n]] = true;
      const part = hunterFileUrlsForBaseName(names[n]);
      for (let i = 0; i < part.length; i++) {
        out.push(part[i]);
      }
    }
    return out;
  }

  function monsterFileUrlsForBaseName(baseName) {
    const folders = [
      "assets/monster",
      "assets/monsters",
      "assets/images/monsters",
    ];
    const out = [];
    for (let f = 0; f < folders.length; f++) {
      for (let i = 0; i < ASSET_EXTS.length; i++) {
        out.push(folders[f] + "/" + baseName + ASSET_EXTS[i]);
      }
    }
    return out;
  }

  /** Extra basenames to try when the primary portrait id has no file (e.g. default → Ash art on disk). */
  function monsterPortraitAliasBases(portraitId) {
    const id = String(portraitId || "default").trim();
    const lower = id.toLowerCase();
    const aliases = [];
    function add(s) {
      const t = String(s).trim();
      if (!t || aliases.indexOf(t) >= 0) return;
      aliases.push(t);
    }
    add(lower);
    if (id !== lower) add(id);
    if (lower === "default") {
      add("ash whelp");
      add("Ash whelp");
      add("ash_whelp");
      add("ashwhelp");
    }
    return aliases;
  }

  /** Try lowercase and original spelling (Windows vs URL case). */
  function tileUrlCandidatesInner(tileType) {
    const names = [];
    const lower = String(tileType).toLowerCase();
    names.push(lower);
    if (tileType !== lower) {
      names.push(tileType);
    }
    const seen = {};
    const out = [];
    for (let n = 0; n < names.length; n++) {
      if (seen[names[n]]) continue;
      seen[names[n]] = true;
      const part = tileFileUrlsForBaseName(names[n]);
      for (let i = 0; i < part.length; i++) {
        out.push(part[i]);
      }
    }
    return out;
  }

  /**
   * Always loads (no files required). Shown when no PNG/WebP/JPEG exists in assets/.
   * Replace files under assets/tiles/ or assets/images/tiles/ to override.
   */
  function svgDataUriTile(type) {
    const t = String(type).toLowerCase();
    const defs = {
      blade: {
        bg: "#4a5058",
        fg: "#e8ecf0",
        inner:
          '<polygon points="128,52 178,204 128,172 78,204" fill="#e8ecf0"/><polygon points="128,72 158,188 128,168 98,188" fill="#8a929c"/>',
      },
      ember: {
        bg: "#a83c12",
        fg: "#ffd6a8",
        inner:
          '<ellipse cx="128" cy="200" rx="70" ry="24" fill="#5c2008" opacity="0.35"/><path d="M128 48 C160 96 168 140 128 200 C88 140 96 96 128 48" fill="#ffd6a8"/><path d="M128 72 C148 108 148 148 128 176 C108 148 108 108 128 72" fill="#ff8c42"/>',
      },
      tide: {
        bg: "#143d78",
        fg: "#7ec8ff",
        inner:
          '<path d="M0 170 C48 130 96 130 144 170 C176 142 224 142 256 178 L256 224 L0 224 Z" fill="#3d7fc4"/><path d="M0 186 C56 154 112 154 168 186 L224 158 L256 188 L256 224 L0 224 Z" fill="#7ec8ff" opacity="0.45"/>',
      },
      spark: {
        bg: "#a67c00",
        fg: "#fff9c4",
        inner:
          '<path d="M148 40 L92 148 L124 148 L108 228 L168 112 L132 112 Z" fill="#fff9c4"/><path d="M138 56 L104 132 L128 132 L118 200 L152 120 L134 120 Z" fill="#ffe066"/>',
      },
      root: {
        bg: "#245a24",
        fg: "#a8e6a8",
        inner:
          '<ellipse cx="128" cy="200" rx="64" ry="20" fill="#183818" opacity="0.4"/><path d="M128 56 Q88 120 96 180 Q128 200 160 180 Q168 120 128 56" fill="#a8e6a8"/><path d="M128 80 L128 200" stroke="#5cb85c" stroke-width="8" stroke-linecap="round"/>',
      },
      void: {
        bg: "#3a1468",
        fg: "#e9d5ff",
        inner:
          '<circle cx="128" cy="128" r="56" fill="none" stroke="#e9d5ff" stroke-width="10"/><circle cx="128" cy="128" r="28" fill="#6b21a8"/>',
      },
      divine: {
        bg: "#8a6b0a",
        fg: "#ffed9e",
        inner:
          '<path d="M128 46 L146 108 L210 108 L158 146 L176 210 L128 172 L80 210 L98 146 L46 108 L110 108 Z" fill="#ffed9e"/><circle cx="128" cy="128" r="14" fill="#fff4c8"/>',
      },
    };
    const d = defs[t] || {
      bg: "#333",
      fg: "#aaa",
      inner: '<circle cx="128" cy="128" r="48" fill="#aaa"/>',
    };
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">' +
      '<rect fill="' +
      d.bg +
      '" width="256" height="256" rx="28"/>' +
      d.inner +
      "</svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function svgDataUriMonster() {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">' +
      '<defs><linearGradient id="mbg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#5c3d28"/><stop offset="1" stop-color="#1c1008"/></linearGradient></defs>' +
      '<rect fill="url(#mbg)" width="256" height="256" rx="28"/>' +
      '<ellipse cx="128" cy="112" rx="62" ry="72" fill="#2a1810" stroke="#8b5c30" stroke-width="5"/>' +
      '<ellipse cx="104" cy="104" rx="14" ry="18" fill="#ff4422"/>' +
      '<ellipse cx="152" cy="104" rx="14" ry="18" fill="#ff4422"/>' +
      '<path fill="#1a0a06" d="M88 152 Q128 128 168 152 L158 188 Q128 208 98 188 Z"/>' +
      "</svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  const ASSETS = {
    tileUrlCandidates: function (tileType) {
      const out = tileUrlCandidatesInner(tileType);
      out.push(svgDataUriTile(tileType));
      return out;
    },
    monsterUrlCandidates: function (fileBase) {
      const names = monsterPortraitAliasBases(fileBase);
      const seen = {};
      const out = [];
      for (let n = 0; n < names.length; n++) {
        if (seen[names[n]]) continue;
        seen[names[n]] = true;
        const part = monsterFileUrlsForBaseName(names[n]);
        for (let i = 0; i < part.length; i++) {
          out.push(part[i]);
        }
      }
      out.push(svgDataUriMonster());
      return out;
    },
    riftCardUrlCandidates: function (cardId) {
      return riftCardUrlCandidatesInner(cardId);
    },
    hunterUrlCandidates: function (hunterId) {
      return hunterUrlCandidatesInner(hunterId);
    },
    /** @deprecated use *UrlCandidates + fallback loader */
    tileUrl: function (tileType) {
      return "assets/tiles/" + tileType + ".png";
    },
    monsterUrl: function (fileBase) {
      return "assets/monster/" + fileBase + ".png";
    },
  };

  window.RH_DATA = {
    TILE_TYPES,
    TILE_BASE_DAMAGE,
    TILE_SPAWN_WEIGHTS,
    ELEMENT_BEATS,
    STRONG_MULT,
    WEAK_TAKEN_MULT,
    CASCADE_MULT_BASE,
    RIFT_CARD_DEFS,
    ASSETS,
    pickWeightedTile,
  };
})();
