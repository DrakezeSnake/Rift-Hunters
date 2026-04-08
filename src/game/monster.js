/**
 * Floor-scaled encounter (aligned with DOM prototype / GDD §9).
 * @param {number} floor
 */
export function monsterForFloor(floor) {
  const hp = Math.floor(180 + ((floor - 1) * (4200 - 180)) / 11);
  const attackTimerMax = Math.max(3.2, 8 - (floor - 1) * 0.45);
  const attackDamage = Math.floor(10 + floor * 2);
  const defs = [
    { name: "Ash Whelp", affinityKey: "ember", portraitId: "default" },
    { name: "Thornback", affinityKey: "root", portraitId: "Thornback" },
    { name: "Bog Wraith", affinityKey: "void", portraitId: "Bog wraith" },
    { name: "Solar Idol", affinityKey: "divine", portraitId: "default" },
  ];
  const def = defs[(floor - 1) % defs.length];
  const isBossFloor = floor % 4 === 0;
  return {
    name: def.name,
    hp,
    maxHp: hp,
    affinityKey: def.affinityKey,
    attackTimerMax: isBossFloor
      ? Math.max(2.4, attackTimerMax - 0.8)
      : attackTimerMax,
    attackDamage,
    portraitId: def.portraitId,
    behaviors: {
      berserk: floor >= 6,
      tileDrain: floor >= 5,
      chargeTelegraph: isBossFloor,
    },
  };
}
