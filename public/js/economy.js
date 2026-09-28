/* Local-only cosmetics and coin wallet. Never use this as authority for LAN gameplay. */
(function (root) {
  'use strict';
  const KEY = 'uno.profile.v1';
  const catalog = {
    decks: [
      { id: 'classic', name: 'Classic', cost: 0 },
      { id: 'cyberpunk', name: 'Cyberpunk', cost: 250 },
      { id: 'retro-neon', name: 'Retro Neon', cost: 200 },
      { id: 'dark', name: 'Minimalist Dark', cost: 175 }
    ],
    tables: [
      { id: 'felt-green', name: 'Felt Green', cost: 0 },
      { id: 'wood', name: 'Wooden', cost: 150 },
      { id: 'galaxy', name: 'Galaxy', cost: 250 },
      { id: 'sci-fi', name: 'Sci-Fi Grid', cost: 200 }
    ]
  };

  function freshProfile() {
    return { version: 1, coins: 0, unlocked: { decks: ['classic'], tables: ['felt-green'] },
      selected: { deck: 'classic', table: 'felt-green' }, rewardedMatches: [] };
  }
  function read() {
    try {
      const saved = JSON.parse(root.localStorage.getItem(KEY));
      if (!saved || saved.version !== 1) return freshProfile();
      const base = freshProfile();
      return { ...base, ...saved, unlocked: { ...base.unlocked, ...saved.unlocked },
        selected: { ...base.selected, ...saved.selected },
        rewardedMatches: Array.isArray(saved.rewardedMatches) ? saved.rewardedMatches : [] };
    } catch (_) { return freshProfile(); }
  }
  let profile = read();
  function save() { root.localStorage.setItem(KEY, JSON.stringify(profile)); return getProfile(); }
  function getProfile() { return JSON.parse(JSON.stringify(profile)); }
  function earnCoins(amount, matchId) {
    if (!Number.isFinite(amount) || amount < 0) throw new TypeError('amount must be non-negative');
    if (matchId && profile.rewardedMatches.includes(String(matchId))) return getProfile();
    profile.coins += Math.floor(amount);
    if (matchId) profile.rewardedMatches.push(String(matchId));
    profile.rewardedMatches = profile.rewardedMatches.slice(-200);
    return save();
  }
  function purchase(category, itemId) {
    if (!catalog[category]) throw new Error('Unknown shop category');
    const item = catalog[category].find(x => x.id === itemId);
    if (!item) throw new Error('Unknown shop item');
    if (profile.unlocked[category].includes(itemId)) return { ok: true, profile: getProfile() };
    if (profile.coins < item.cost) return { ok: false, reason: 'Not enough coins', profile: getProfile() };
    profile.coins -= item.cost;
    profile.unlocked[category].push(itemId);
    return { ok: true, profile: save() };
  }
  function select(category, itemId) {
    if (!catalog[category] || !profile.unlocked[category].includes(itemId)) return false;
    profile.selected[category === 'decks' ? 'deck' : 'table'] = itemId;
    save(); return true;
  }
  root.UnoEconomy = Object.freeze({ catalog, getProfile, earnCoins, purchase, select });
})(window);
