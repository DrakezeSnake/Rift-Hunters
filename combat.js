/**
 * Rift Hunters — damage, affinity, timer modifiers, Rift Card hooks.
 */
(function () {
  const D = function () {
    return window.RH_DATA;
  };

  function affinityMult(tileType, monsterAffinityKey) {
    const data = D();
    const a = data.AFFINITY[monsterAffinityKey];
    if (!a) return 1;
    if (a.boss) {
      return 0.5;
    }
    if (a.weak.indexOf(tileType) >= 0) return data.WEAK_MULT;
    if (a.resist.indexOf(tileType) >= 0) return data.RESIST_MULT;
    return 1;
  }

  function baseDamageFromTile(tile) {
    const data = D();
    let base = data.TILE_BASE_DAMAGE[tile.type] || 8;
    if (tile.special === "power") {
      base *= 2;
    }
    return base;
  }

  /**
   * Cascade multiplier (documented rule):
   * Wave index 0 = first match resolution after a swap → multiplier 1.5^0 = 1.
   * Each subsequent automatic cascade wave increments index → ×1.5, ×1.5², …
   */
  function cascadeMultiplier(cascadeIndex) {
    const b = D().CASCADE_MULT_BASE;
    return Math.pow(b, cascadeIndex);
  }

  function collectCardHooks(state, hookName) {
    const out = [];
    const cards = state.run.riftCards || [];
    for (let i = 0; i < cards.length; i++) {
      const def = D().RIFT_CARD_DEFS[cards[i]];
      if (def && def.hooks && def.hooks[hookName]) {
        out.push(def.hooks[hookName]);
      }
    }
    return out;
  }

  function applyFloatHooks(state, hookName, initial) {
    const hooks = collectCardHooks(state, hookName);
    let v = initial;
    for (let i = 0; i < hooks.length; i++) {
      const r = hooks[i]();
      if (typeof r === "number" && !isNaN(r)) {
        v *= r;
      }
    }
    return v;
  }

  function resolveWaveDamage(state, wave) {
    const tiles = wave.tiles;
    const cascadeIndex = wave.cascadeIndex;
    let damage = 0;
    let heal = 0;

    const cm = cascadeMultiplier(cascadeIndex);

    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (t.type === null) continue;
      let d = baseDamageFromTile(t);
      d *= cm;
      d *= affinityMult(t.type, state.monster.affinityKey);
      damage += Math.max(0, Math.floor(d));
      if (t.type === "root") {
        heal += 5;
      }
    }

    const bonusCtx = {
      tiles: tiles,
      cascadeIndex: cascadeIndex,
      cascadeMult: cm,
      baseDamageFromTile: baseDamageFromTile,
    };
    const afterHooks = collectCardHooks(state, "afterWaveDamage");
    for (let i = 0; i < afterHooks.length; i++) {
      const b = afterHooks[i](bonusCtx);
      if (typeof b === "number") {
        damage += Math.max(0, Math.floor(b));
      }
    }

    damage = Math.max(0, Math.floor(damage));
    damage = Math.floor(
      damage * applyFloatHooks(state, "playerOutgoingDamageMult", 1)
    );

    return { damage: damage, heal: heal };
  }

  function monsterDamageToPlayer(state, baseDamage) {
    let d = baseDamage;
    d *= applyFloatHooks(state, "monsterOutgoingDamageMult", 1);
    return Math.max(0, Math.floor(d));
  }

  function timerSpeedMultiplier(state) {
    return applyFloatHooks(state, "timerSpeedMultiplier", 1);
  }

  window.RH_COMBAT = {
    affinityMult,
    baseDamageFromTile,
    cascadeMultiplier,
    resolveWaveDamage,
    monsterDamageToPlayer,
    timerSpeedMultiplier,
  };
})();
