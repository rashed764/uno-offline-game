'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_DATABASE_PATH = path.join(__dirname, '..', '..', 'data', 'wallets.json');

class WalletDatabase {
  constructor(filePath = process.env.UNO_WALLET_DB || DEFAULT_DATABASE_PATH) {
    this.filePath = filePath;
    this.data = { version: 1, wallets: {} };
    this.load();
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (saved && saved.version === 1 && saved.wallets && typeof saved.wallets === 'object') {
        this.data = saved;
        Object.values(this.data.wallets).forEach(wallet => {
          if (!Array.isArray(wallet.unlocked)) wallet.unlocked = [];
        });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`Could not read wallet database: ${error.message}`);
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tempPath, this.filePath);
  }

  isValidId(walletId) {
    return typeof walletId === 'string' && /^[a-z0-9-]{16,80}$/i.test(walletId);
  }

  getOrCreate(walletId) {
    if (!this.isValidId(walletId)) throw new Error('Invalid wallet ID');
    if (!this.data.wallets[walletId]) {
      this.data.wallets[walletId] = { coins: 100, unlocked: [], createdAt: new Date().toISOString() };
      this.save();
    } else if (!Array.isArray(this.data.wallets[walletId].unlocked)) {
      this.data.wallets[walletId].unlocked = [];
      this.save();
    }
    return { ...this.data.wallets[walletId] };
  }

  getBalance(walletId) {
    return this.getOrCreate(walletId).coins;
  }

  debit(walletId, amount) {
    if (!Number.isInteger(amount) || amount < 0) return false;
    const wallet = this.getOrCreate(walletId);
    if (wallet.coins < amount) return false;
    this.data.wallets[walletId].coins -= amount;
    this.save();
    return this.data.wallets[walletId].coins;
  }

  credit(walletId, amount) {
    if (!Number.isInteger(amount) || amount < 0) return false;
    this.getOrCreate(walletId);
    this.data.wallets[walletId].coins += amount;
    this.save();
    return this.data.wallets[walletId].coins;
  }

  purchase(walletId, itemId, cost) {
    if (typeof itemId !== 'string' || !Number.isInteger(cost) || cost < 0) return { ok: false };
    const wallet = this.getOrCreate(walletId);
    if (wallet.unlocked.includes(itemId)) return { ok: true, alreadyOwned: true, coins: wallet.coins };
    if (wallet.coins < cost) return { ok: false, coins: wallet.coins };
    const stored = this.data.wallets[walletId];
    stored.coins -= cost;
    stored.unlocked.push(itemId);
    this.save();
    return { ok: true, coins: stored.coins };
  }
}

module.exports = WalletDatabase;
