import {
  ELEMENT_BEATS,
  STRONG_MULT,
  CASCADE_MULT_BASE,
  RIFT_CARD_DEFS,
  TILE_BASE_DAMAGE,
} from "./data.js";

function attackerVsDefenderMult(attackerElement, defenderElement) {
  const beats = ELEMENT_BEATS[attackerElement] || [];
  if (beats.indexOf(defenderElement) >= 0) return STRONG_MULT;
  return 1;
}

export function incomingMultiplier(monsterElement, hunterElement) {
  return attackerVsDefenderMult(monsterElement, hunterElement);
}

export function baseDamageFromTile(tile) {
  let base = TILE_BASE_DAMAGE[tile.type] || 8;
  if (tile.special === "power") {
    base *= 2;
  }
  return base;
}

export function cascadeMultiplier(cascadeIndex) {
  return Math.pow(CASCADE_MULT_BASE, cascadeIndex);
}

function collectCardHooks(state, hookName) {
  const out = [];
  const cards = state.run.riftCards || [];
  for (let i = 0; i < cards.length; i++) {
    const def = RIFT_CARD_DEFS[cards[i]];
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

export function resolveWaveDamage(state, wave) {
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
    d *= attackerVsDefenderMult(t.type, state.monster.affinityKey);
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

export function monsterDamageToPlayer(state, baseDamage) {
  let d = baseDamage;
  d *= incomingMultiplier(state.monster.affinityKey, state.hunter.elementType);
  d *= applyFloatHooks(state, "monsterOutgoingDamageMult", 1);
  return Math.max(0, Math.floor(d));
}

export function timerSpeedMultiplier(state) {
  return applyFloatHooks(state, "timerSpeedMultiplier", 1);
}
