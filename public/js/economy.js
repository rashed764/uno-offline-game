/* Local cosmetics plus a server-synchronized wallet mirror for offline/LAN play. */
(function (root) {
  'use strict';
  const KEY = 'uno.profile.v1';
  const catalog = root.UnoThemeCatalog;

  function freshProfile() {
    return { version: 1, coins: 100, unlocked: { decks: ['classic'], tables: ['felt-green'] },
      selected: { deck: 'classic', table: 'felt-green' }, rewardedMatches: [], wagers: {}, settledMatches: [] };
  }
  function read() {
    try {
      const saved = JSON.parse(root.localStorage.getItem(KEY));
      if (!saved || saved.version !== 1) return freshProfile();
      const base = freshProfile();
      return { ...base, ...saved, unlocked: { ...base.unlocked, ...saved.unlocked },
        selected: { ...base.selected, ...saved.selected },
        rewardedMatches: Array.isArray(saved.rewardedMatches) ? saved.rewardedMatches : [],
        wagers: saved.wagers && typeof saved.wagers === 'object' ? saved.wagers : {},
        settledMatches: Array.isArray(saved.settledMatches) ? saved.settledMatches : [] };
    } catch (_) { return freshProfile(); }
  }
  let profile = read();
  function save() { root.localStorage.setItem(KEY, JSON.stringify(profile)); return getProfile(); }
  function getProfile() { return JSON.parse(JSON.stringify(profile)); }
  function getWalletId() {
    const walletKey = 'uno.wallet.id.v1';
    let id = root.localStorage.getItem(walletKey);
    if (!id) {
      id = root.crypto?.randomUUID?.()
        || `wallet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      root.localStorage.setItem(walletKey, id);
    }
    return id;
  }
  function setCoins(amount) {
    if (!Number.isInteger(amount) || amount < 0) return false;
    profile.coins = amount;
    save();
    return true;
  }
  function grantPurchase(category, itemId) {
    if (!catalog[category] || !catalog[category].some(item => item.id === itemId)) return false;
    if (!profile.unlocked[category].includes(itemId)) profile.unlocked[category].push(itemId);
    save();
    return true;
  }
  function select(category, itemId) {
    if (!catalog[category] || !profile.unlocked[category].includes(itemId)) return false;
    profile.selected[category === 'decks' ? 'deck' : 'table'] = itemId;
    save(); return true;
  }
  function registerItem(category, item) {
    const requiredThemeFields = category === 'decks' ? ['surface', 'panel', 'emblem'] : ['surface', 'frame'];
    if (!catalog[category] || !item || typeof item.id !== 'string' || !item.id.trim()
      || typeof item.name !== 'string' || !Number.isFinite(item.cost) || item.cost < 0
      || !item.theme || requiredThemeFields.some(field => typeof item.theme[field] !== 'string')
      || catalog[category].some(existing => existing.id === item.id)) return false;
    catalog[category].push({ ...item, theme: { ...item.theme } });
    return true;
  }
  root.UnoEconomy = Object.freeze({ catalog, getProfile, getWalletId, setCoins, grantPurchase, select, registerItem });
})(window);
