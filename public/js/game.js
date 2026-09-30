/**
 * UNO! 3D Perspective - Reactive Real-Time Client Controller
 * Built with absolute architectural state synchronization and defensive coding.
 */
(function () {
  'use strict';

  // 1. Establish Socket Connection
  const socket = io();

  // 2. Authoritative Client-side App State
  const appState = {
    playerName: 'Player 1',
    roomId: null,
    myPlayerId: null,
    isHost: false,
    mode: null,
    selectedCardId: null,
    pendingWildCardId: null,
    pendingWildCardIndex: null,
    pendingAction: null,
    isMyTurn: false,
    canDraw: false,
    canPass: false,
    isDealing: false,
    isDealingOrFanning: false,
    latestServerState: null,
    stake: 50,
    targetPlayers: 2,
    matchRewardId: null,
    walletId: window.UnoEconomy?.getWalletId(),
    walletReady: false,
    isAdmin: false,
    wantsAdminMode: new URLSearchParams(window.location.search).get('admin') === '1'
  };

  // Expose appState globally for testing or dev console inspection
  window.appState = appState;
  window.isDealingOrFanning = false;

  function syncWalletBalance(coins) {
    if (!window.UnoEconomy?.setCoins(coins)) return;
    ['menu-coin-balance', 'shop-coin-balance'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = coins.toLocaleString();
    });
    window.dispatchEvent(new CustomEvent('uno-wallet-balance-changed', { detail: { coins } }));
  }

  function applySelectedThemes() {
    const economy = window.UnoEconomy;
    if (!economy) return;
    const profile = economy.getProfile();
    const deck = economy.catalog.decks.find(item => item.id === profile.selected.deck);
    const table = economy.catalog.tables.find(item => item.id === profile.selected.table);
    document.documentElement.dataset.deckTheme = deck?.id || 'classic';
    if (deck) {
      document.documentElement.style.setProperty('--deck-back-surface', deck.theme.surface);
      document.documentElement.style.setProperty('--deck-back-panel', deck.theme.panel);
      document.documentElement.style.setProperty('--deck-back-emblem', deck.theme.emblem);
    }
    const drawDeck = document.getElementById('draw-deck-3d');
    if (drawDeck && deck && drawDeck.dataset.deckTheme !== deck.id) {
      const cardCount = Math.max(1, drawDeck.children.length);
      drawDeck.replaceChildren(...Array.from({ length: cardCount }, (_, index) => create3DCardElement(null, index, 0, true, deck.id)));
      drawDeck.dataset.deckTheme = deck.id;
    }
    if (table) {
      document.documentElement.style.setProperty('--table-theme-surface', table.theme.surface);
      document.documentElement.style.setProperty('--table-theme-frame', table.theme.frame);
    }
  }

  function setupThemeShop() {
    const economy = window.UnoEconomy;
    const openButton = document.getElementById('btn-shop');
    const closeButton = document.getElementById('btn-shop-close');
    const modal = document.getElementById('theme-shop-modal');
    const catalogEl = document.getElementById('theme-shop-catalog');
    const adminNote = document.getElementById('shop-admin-note');
    if (!economy || !openButton || !modal || !catalogEl) return;
    const renderThemePreview = (category, item, preview) => {
      preview.replaceChildren();
      preview.classList.add('is-open');
      if (category === 'decks') {
        const note = document.createElement('p');
        note.className = 'shop-inline-preview-note';
        note.textContent = '10 card samples · Tap a card to flip and view this theme’s back.';
        const grid = document.createElement('div');
        grid.className = 'card-preview-grid';
        const designs = [
          { color: 'red', value: '0' },
          { color: 'blue', value: '7' },
          { color: 'green', value: 'skip' },
          { color: 'yellow', value: 'reverse' },
          { color: 'red', value: 'draw2' },
          { color: 'blue', value: 'draw2' },
          { color: 'wild', value: 'wild' },
          { color: 'wild', value: 'wild_draw4' },
          { color: 'green', value: '9' },
          { color: 'yellow', value: '5' }
        ];
        designs.forEach((design, index) => {
          const flipButton = document.createElement('button');
          flipButton.type = 'button';
          flipButton.className = 'shop-flip-card';
          flipButton.setAttribute('aria-label', `${design.color} ${design.value} card. Flip to see the back.`);
          const flipInner = document.createElement('span');
          flipInner.className = 'shop-flip-card-inner';
          flipInner.style.setProperty('--deck-back-surface', item.theme.surface);
          flipInner.style.setProperty('--deck-back-panel', item.theme.panel);
          flipInner.style.setProperty('--deck-back-emblem', item.theme.emblem);
          const front = document.createElement('span');
          front.className = 'shop-flip-face';
          const frontCard = create3DCardElement(design, index, 0, false, item.id);
          front.appendChild(frontCard);
          const back = document.createElement('span');
          back.className = 'shop-flip-face shop-flip-back';
          const backCard = create3DCardElement(null, index, 0, true, item.id);
          back.appendChild(backCard);
          flipInner.append(front, back);
          const label = document.createElement('span');
          label.className = 'shop-flip-card-label';
          label.textContent = `${design.color === 'wild' ? 'Wild' : design.color} · ${design.value}`;
          flipButton.append(flipInner, label);
          grid.appendChild(flipButton);
        });
        preview.append(note, grid);
      } else {
        const wrap = document.createElement('div');
        wrap.className = 'theme-board-preview-wrap';
        const board = document.createElement('div');
        board.className = 'theme-board-preview';
        board.style.setProperty('--preview-table-surface', item.theme.surface);
        board.style.setProperty('--preview-table-frame', item.theme.frame);
        const boardTitle = document.createElement('span');
        boardTitle.className = 'theme-board-preview-title';
        boardTitle.textContent = 'UNO';
        const cardFan = document.createElement('div');
        cardFan.className = 'theme-board-preview-cards';
        [
          { color: 'blue', value: '5' },
          { color: 'red', value: 'reverse' },
          { color: 'wild', value: 'wild_draw4' }
        ].forEach((design, index) => cardFan.appendChild(create3DCardElement(design, index, (index - 1) * 8)));
        board.append(boardTitle, cardFan);
        wrap.appendChild(board);
        const caption = document.createElement('p');
        caption.className = 'theme-board-preview-caption';
        caption.textContent = `${item.name} table preview`;
        preview.append(wrap, caption);
      }
    };

    const setBalance = () => {
      const balance = economy.getProfile().coins;
      const menuBalance = document.getElementById('menu-coin-balance');
      const shopBalance = document.getElementById('shop-coin-balance');
      if (menuBalance) menuBalance.textContent = balance;
      if (shopBalance) shopBalance.textContent = balance;
    };

    const renderCatalog = () => {
      const profile = economy.getProfile();
      catalogEl.replaceChildren();
      [
        { key: 'decks', title: 'Card Back Themes' },
        { key: 'tables', title: 'Board Themes' }
      ].forEach(({ key, title }) => {
        const section = document.createElement('section');
        section.className = 'shop-category';
        const heading = document.createElement('h4');
        heading.textContent = title;
        section.appendChild(heading);
        const grid = document.createElement('div');
        grid.className = 'shop-item-grid';

        economy.catalog[key].forEach(item => {
          const unlocked = profile.unlocked[key].includes(item.id);
          const selectedKey = key === 'decks' ? 'deck' : 'table';
          const equipped = profile.selected[selectedKey] === item.id;
          const card = document.createElement('article');
          card.className = 'shop-item';
          card.dataset.category = key;
          card.dataset.itemId = item.id;

          const preview = document.createElement('span');
          preview.className = 'shop-preview';
          preview.style.setProperty('--shop-preview-surface', item.theme.surface);
          preview.style.setProperty('--shop-preview-panel', item.theme.panel || 'transparent');
          preview.style.setProperty('--shop-preview-mark', item.theme.emblem || 'rgba(255,255,255,.75)');
          preview.style.setProperty('--shop-preview-frame', item.theme.frame || 'rgba(255,255,255,.7)');
          const copy = document.createElement('span');
          copy.className = 'shop-item-copy';
          const name = document.createElement('strong');
          name.textContent = item.name;
          const cost = document.createElement('small');
          cost.textContent = item.cost === 0 ? 'Free' : `${item.cost} coins`;
          copy.append(name, cost);

          const action = document.createElement('button');
          action.type = 'button';
          action.className = 'shop-item-action';
          action.dataset.shopAction = appState.isAdmin && !equipped ? 'admin-equip' : (unlocked ? 'select' : 'purchase');
          action.textContent = equipped ? 'Equipped' : (appState.isAdmin ? 'Admin Equip' : (unlocked ? 'Use' : 'Buy'));
          action.disabled = equipped || (!appState.isAdmin && !unlocked && profile.coins < item.cost);
          if (!appState.isAdmin && !unlocked && profile.coins < item.cost) action.textContent = 'Too costly';
          const actions = document.createElement('div');
          actions.className = 'shop-item-actions';
          actions.appendChild(action);
          const previewButton = document.createElement('button');
          previewButton.type = 'button';
          previewButton.className = 'shop-preview-button';
          previewButton.dataset.themePreview = 'true';
          previewButton.textContent = 'Preview';
          actions.appendChild(previewButton);
          const row = document.createElement('div');
          row.className = 'shop-item-row';
          row.append(preview, copy, actions);
          const previewPanel = document.createElement('div');
          previewPanel.className = 'shop-inline-preview';
          card.append(row, previewPanel);
          grid.appendChild(card);
        });
        section.appendChild(grid);
        catalogEl.appendChild(section);
      });
      adminNote?.classList.toggle('hidden', !appState.isAdmin);
      setBalance();
    };

    openButton.addEventListener('click', () => {
      renderCatalog();
      modal.classList.remove('hidden');
    });
    closeButton?.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', event => {
      if (event.target === modal) modal.classList.add('hidden');
    });
    catalogEl.addEventListener('click', event => {
      const card = event.target.closest('.shop-flip-card');
      if (card) card.classList.toggle('is-flipped');
    });
    catalogEl.addEventListener('click', event => {
      const button = event.target.closest('[data-theme-preview]');
      const itemEl = button?.closest('.shop-item');
      if (!button || !itemEl) return;
      const category = itemEl.dataset.category;
      const item = economy.catalog[category]?.find(entry => entry.id === itemEl.dataset.itemId);
      const panel = itemEl.querySelector('.shop-inline-preview');
      const wasOpen = itemEl.classList.contains('show-preview');
      catalogEl.querySelectorAll('.shop-item.show-preview').forEach(openItem => {
        openItem.classList.remove('show-preview');
        const openButton = openItem.querySelector('[data-theme-preview]');
        if (openButton) openButton.textContent = 'Preview';
      });
      if (item && panel && !wasOpen) {
        renderThemePreview(category, item, panel);
        itemEl.classList.add('show-preview');
        button.textContent = 'Hide';
      }
    });
    catalogEl.addEventListener('click', event => {
      const button = event.target.closest('[data-shop-action]');
      const itemEl = button?.closest('.shop-item');
      if (!button || !itemEl) return;
      const { category, itemId } = itemEl.dataset;
      if (button.dataset.shopAction === 'admin-equip' && appState.isAdmin) {
        economy.grantPurchase(category, itemId);
        if (economy.select(category, itemId)) {
          applySelectedThemes();
          showToast('Admin preview: theme equipped for free.');
        }
        renderCatalog();
        return;
      }
      if (button.dataset.shopAction === 'purchase') {
        if (!appState.walletReady) {
          showToast('Your saved wallet is still loading.');
          return;
        }
        socket.emit('shop_purchase', { itemId }, result => {
          if (!result?.ok) {
            showToast(result?.error || 'Could not purchase this theme.');
            return;
          }
          economy.grantPurchase(category, itemId);
          economy.select(category, itemId);
          syncWalletBalance(result.coins);
          applySelectedThemes();
          showToast('Theme purchased and equipped!');
          renderCatalog();
        });
        return;
      } else if (economy.select(category, itemId)) {
        applySelectedThemes();
        showToast('Theme equipped!');
      }
      renderCatalog();
    });
    setBalance();
    renderCatalog();
    window.addEventListener('uno-wallet-balance-changed', renderCatalog);
    window.addEventListener('uno-admin-mode-changed', renderCatalog);
  }
  applySelectedThemes();

  // ==========================================================================
  // FULLSCREEN & RESPONSIVE CANVAS SCALING
  // ==========================================================================

  let fullscreenRequestInFlight = false;
  function requestFullscreenApp() {
    const elem = document.documentElement;
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement
      || document.mozFullScreenElement || document.msFullscreenElement;
    if (!isFullscreen && !fullscreenRequestInFlight) {
      if (elem.requestFullscreen) {
        fullscreenRequestInFlight = true;
        elem.requestFullscreen({ navigationUI: 'hide' })
          .then(() => window.screen?.orientation?.lock?.('landscape'))
          .catch(() => {})
          .finally(() => { fullscreenRequestInFlight = false; });
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      } else if (elem.mozRequestFullScreen) {
        elem.mozRequestFullScreen();
      } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
      }
    }
  }

  function getPlayerHandCardPlacement(handContainer, totalCards, index, cardWidth) {
    const availableWidth = handContainer.clientWidth || 380;
    const maxUsableWidth = Math.max(0, availableWidth - cardWidth - 12);
    const cardStep = Math.min(34, Math.max(18, cardWidth * 0.7));
    const spreadWidth = totalCards > 1
      ? Math.min((totalCards - 1) * cardStep, maxUsableWidth)
      : 0;
    const angle = totalCards > 1
      ? -17.5 + index * (35 / (totalCards - 1))
      : 0;
    const x = totalCards > 1
      ? -spreadWidth / 2 + index * (spreadWidth / (totalCards - 1))
      : 0;
    return { x, y: Math.abs(angle) * 0.5, angle };
  }

  function relayoutPlayerHand(handContainer) {
    if (!handContainer) handContainer = document.getElementById('player-cards-fan');
    if (!handContainer) return;
    const cardEls = Array.from(handContainer.children)
      .filter(card => card.classList.contains('card-3d') && !card.classList.contains('draw-flight-card'));
    const totalCards = cardEls.length;
    if (totalCards === 0) return;

    const cardWidth = parseFloat(getComputedStyle(cardEls[0]).width) || cardEls[0]?.offsetWidth || 64;

    cardEls.forEach((cardEl, idx) => {
      const { x: targetX, y: targetY, angle } = getPlayerHandCardPlacement(handContainer, totalCards, idx, cardWidth);

      cardEl.style.setProperty('--x', targetX);
      cardEl.style.setProperty('--y', targetY);
      cardEl.style.setProperty('--angle', angle);
      cardEl.style.setProperty('--index', idx);
      cardEl.style.setProperty('--i', idx);
      cardEl.style.position = 'absolute';
      cardEl.style.transformOrigin = 'bottom center';
      if (!cardEl.classList.contains('selected')) {
        cardEl.style.transform = `translateX(${targetX}px) translateY(${targetY}px) rotateZ(${angle}deg) scale(1)`;
      }
    });
  }

  function updateGameScaling() {
    const scaler = document.getElementById('screen-scaler');
    if (!scaler) return;

    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Mobile / small viewport / touch screen
    if (windowWidth <= 1024 || windowHeight <= 600 || isTouch) {
      scaler.style.transform = 'translate(-50%, -50%) scale(1)';
      scaler.style.width = '100%';
      scaler.style.height = '100%';
      relayoutPlayerHand();
      return;
    }

    // Desktop PC scaling for 1200x800 design
    const designWidth = 1200;
    const designHeight = 800;

    const scaleX = windowWidth / designWidth;
    const scaleY = windowHeight / designHeight;
    const scale = Math.min(scaleX, scaleY);

    scaler.style.transform = `translate(-50%, -50%) scale(${scale})`;
    scaler.style.width = '1200px';
    scaler.style.height = '800px';
    relayoutPlayerHand();
  }

  window.addEventListener('resize', updateGameScaling);
  window.visualViewport?.addEventListener('resize', updateGameScaling);
  window.addEventListener('fullscreenchange', updateGameScaling);
  window.addEventListener('webkitfullscreenchange', updateGameScaling);
  window.addEventListener('orientationchange', () => {
    setTimeout(updateGameScaling, 250);
  });

  // Browsers require a user gesture before entering true fullscreen
  window.addEventListener('pointerdown', () => {
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    if (isTouch && Math.min(window.innerWidth, window.innerHeight) <= 768) {
      requestFullscreenApp();
    }
  }, { capture: true });
  updateGameScaling();

  // ==========================================================================
  // HELPER FUNCTIONS (Screen Switcher, Toasts, Modals)
  // ==========================================================================

  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
    }
  }

  function showToast(msg) {
    const toast = document.getElementById('toast-message');
    if (!toast) return;

    toast.innerHTML = `<i class="fa-solid fa-bell"></i> ${msg}`;
    toast.classList.remove('hidden');
    toast.style.animation = 'none';
    toast.offsetHeight; // force reflow
    toast.style.animation = '';

    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2800);
  }

  function showGameAlert(message, title = 'UNO ALERT') {
    const menuDrawer = document.getElementById('game-menu-drawer');
    if (menuDrawer) menuDrawer.classList.add('hidden');

    const modal = document.getElementById('custom-game-modal');
    const titleEl = document.getElementById('custom-modal-title');
    const msgEl = document.getElementById('custom-modal-message');
    const footerEl = document.getElementById('custom-modal-footer');

    if (!modal || !titleEl || !msgEl || !footerEl) {
      alert(message);
      return;
    }

    titleEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${title}`;
    msgEl.textContent = message;
    footerEl.innerHTML = `
      <button id="custom-modal-ok" class="btn btn-success-3d" style="width: 100%; justify-content: center;">
        <i class="fa-solid fa-check"></i> OK
      </button>
    `;

    modal.classList.remove('hidden');

    const okBtn = document.getElementById('custom-modal-ok');
    if (okBtn) {
      okBtn.onclick = () => {
        modal.classList.add('hidden');
      };
    }
  }

  function showGameConfirm(message, callback, title = 'CONFIRMATION') {
    const menuDrawer = document.getElementById('game-menu-drawer');
    if (menuDrawer) menuDrawer.classList.add('hidden');

    const modal = document.getElementById('custom-game-modal');
    const titleEl = document.getElementById('custom-modal-title');
    const msgEl = document.getElementById('custom-modal-message');
    const footerEl = document.getElementById('custom-modal-footer');

    if (!modal || !titleEl || !msgEl || !footerEl) {
      const answer = confirm(message);
      if (typeof callback === 'function') callback(answer);
      return;
    }

    titleEl.innerHTML = `<i class="fa-solid fa-circle-question"></i> ${title}`;
    msgEl.textContent = message;
    footerEl.innerHTML = `
      <button id="custom-modal-cancel" class="btn btn-danger-3d" style="flex: 1; justify-content: center;">
        <i class="fa-solid fa-xmark"></i> Cancel
      </button>
      <button id="custom-modal-confirm" class="btn btn-success-3d" style="flex: 1; justify-content: center;">
        <i class="fa-solid fa-check"></i> Confirm
      </button>
    `;

    modal.classList.remove('hidden');

    const cancelBtn = document.getElementById('custom-modal-cancel');
    const confirmBtn = document.getElementById('custom-modal-confirm');

    if (cancelBtn) {
      cancelBtn.onclick = () => {
        modal.classList.add('hidden');
        if (typeof callback === 'function') callback(false);
      };
    }

    if (confirmBtn) {
      confirmBtn.onclick = () => {
        modal.classList.add('hidden');
        if (typeof callback === 'function') callback(true);
      };
    }
  }

  window.showGameAlert = showGameAlert;
  window.showGameConfirm = showGameConfirm;

  // ==========================================================================
  // REAL-TIME SOCKET.IO EVENT HANDLERS
  // ==========================================================================

  socket.on('connect', () => {
    console.log('[Socket] Connected. ID:', socket.id);
    if (!appState.myPlayerId) {
      appState.myPlayerId = socket.id;
    }
    appState.walletReady = false;
    socket.emit('wallet_login', { walletId: appState.walletId, adminMode: appState.wantsAdminMode }, response => {
      if (!response?.ok) {
        showToast(response?.error || 'Could not load your saved coin wallet.');
        return;
      }
      appState.walletReady = true;
      appState.isAdmin = response.adminMode === true;
      if (appState.wantsAdminMode && !appState.isAdmin) showToast('Admin mode is only available on the game server computer.');
      window.dispatchEvent(new CustomEvent('uno-admin-mode-changed', { detail: { isAdmin: appState.isAdmin } }));
      syncWalletBalance(response.coins);
    });
  });

  socket.on('disconnect', () => { appState.walletReady = false; });
  socket.on('wallet_balance', ({ coins } = {}) => {
    if (Number.isInteger(coins) && coins >= 0) syncWalletBalance(coins);
  });

  // Room Created / Joined
  socket.on('room_created', ({ roomId, player, mode, players, stake = 50, targetPlayers = 2 }) => {
    console.log(`[Lobby] Room ready: ${roomId} (Host: ${player?.isHost})`);
    appState.roomId = roomId;
    appState.isHost = Boolean(player?.isHost);
    appState.mode = mode;
    appState.stake = stake;
    appState.targetPlayers = targetPlayers;
    if (player && player.id) {
      appState.myPlayerId = player.id;
    }

    const codeEl = document.getElementById('lobby-room-code');
    if (codeEl) {
      codeEl.textContent = roomId;
    }

    const playerList = players || (player ? [{ id: player.id, name: player.name, isHost: player.isHost }] : []);
    updatePlayersLobbyList(playerList);

    const wallet = window.UnoEconomy?.getProfile().coins ?? 0;
    if (mode === 'lan' && !player?.isHost && !appState.isAdmin && wallet < stake) {
      socket.emit('leave_room', { roomId });
      appState.roomId = null;
      showToast(`This room needs ${stake} coins, but your balance is ${wallet}.`);
      return;
    }
    const wagerInfo = document.getElementById('lobby-wager-info');
    if (wagerInfo) wagerInfo.textContent = appState.isAdmin
      ? (stake === 0 ? `Admin test match · ${targetPlayers} players · No coins used.` : `Admin mode · Your stake is waived; other players retain their ${stake} coin stake.`)
      : `${stake} coin stake · ${targetPlayers} players · Winner's pot: ${stake * targetPlayers} coins`;

    // In AI Mode, immediately trigger match start for the host
    if (mode === 'ai' && player?.isHost) {
      socket.emit('start_game', { roomId });
      return;
    }

    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) {
      if (player?.isHost) {
        startBtn.classList.remove('hidden');
      } else {
        startBtn.classList.add('hidden');
      }
    }

    showScreen('lobby-screen');
  });

  socket.on('player_joined', ({ players }) => {
    updatePlayersLobbyList(players);
  });

  socket.on('player_left', ({ players }) => {
    updatePlayersLobbyList(players);
  });

  socket.on('room_wager_updated', ({ stake = 0, targetPlayers } = {}) => {
    appState.stake = Number(stake);
    if (Number.isInteger(Number(targetPlayers))) appState.targetPlayers = Number(targetPlayers);
    const wagerInfo = document.getElementById('lobby-wager-info');
    if (wagerInfo) wagerInfo.textContent = 'Admin test room · No coins will be charged or awarded.';
  });

  // Game Started Event - Immediate transition & authoritative UI render
  socket.on('game_started', (payload) => {
    const gameState = (payload && payload.gameState) ? payload.gameState : payload;
    const wagerInfo = payload?.wager || {};
    appState.stake = Number(wagerInfo.stake ?? appState.stake ?? 50);
    appState.targetPlayers = Number(wagerInfo.playerCount || appState.targetPlayers || gameState?.players?.length || 2);
    appState.matchRewardId = payload?.matchId || `${appState.roomId || 'match'}:${Date.now()}`;
    appState.latestServerState = gameState;

    appState.selectedCardId = null;
    appState.pendingWildCardId = null;
    appState.pendingWildCardIndex = null;
    appState.pendingAction = null;
    appState.isDealing = true;
    appState.isDealingOrFanning = true;
    window.isDealingOrFanning = true;

    showScreen('game-screen');

    const roomIdEl = document.getElementById('game-room-id');
    if (roomIdEl && appState.roomId) {
      roomIdEl.textContent = appState.roomId;
    }

    // Clean initial hand containers and reset counts to 0 during deal phase
    const handContainer = document.getElementById('player-cards-fan');
    if (handContainer) handContainer.innerHTML = '';
    ['left', 'top', 'right'].forEach(pos => {
      const el = document.getElementById(`opp-${pos}-cards`);
      if (el) el.innerHTML = '';
      const countEl = document.getElementById(`opp-${pos}-count`);
      if (countEl) countEl.textContent = '0';
    });

    // Render initial static elements & opponents seating info
    setupOpponentsSeating(gameState);
    renderDiscardPile(null);

    console.log('🚀 Game match started! Executing animateDealSequence()...');
    animateDealSequence(gameState, () => {
      renderGame(appState.latestServerState || gameState);
      showToast('🃏 Match started! Cards dealt.');
    });
  });

  // Update Game State Event
  socket.on('update_game', (payload) => {
    appState.pendingAction = null;
    const gameState = (payload && payload.gameState) ? payload.gameState : payload;
    const previousState = appState.latestServerState;
    captureReverseTransition(previousState, gameState);
    const remoteDiscardSource = captureRemoteDiscardSource(previousState, gameState);
    const remoteDrawEvent = captureRemoteDrawEvent(previousState, gameState);
    appState.latestServerState = gameState;

    if (window.isDealingOrFanning || appState.isDealingOrFanning) {
      console.log('[Socket] update_game received during dealing/fanning - deferred.');
      return;
    }

    const gameScreen = document.getElementById('game-screen');
    if (gameScreen && !gameScreen.classList.contains('active')) {
      showScreen('game-screen');
    }

    renderGame(gameState);
    maintainDrawTwoTargetVisual();
    animateRemoteDiscard(previousState, gameState, remoteDiscardSource);
    animateRemoteDraw(remoteDrawEvent, gameState);
  });

  // Direct state sync packet
  socket.on('game_state', (payload) => {
    appState.pendingAction = null;
    const gameState = (payload && payload.gameState) ? payload.gameState : payload;
    const previousState = appState.latestServerState;
    captureReverseTransition(previousState, gameState);
    const remoteDiscardSource = captureRemoteDiscardSource(previousState, gameState);
    const remoteDrawEvent = captureRemoteDrawEvent(previousState, gameState);
    appState.latestServerState = gameState;

    if (window.isDealingOrFanning || appState.isDealingOrFanning) {
      console.log('[Socket] game_state received during dealing/fanning - deferred.');
      return;
    }

    renderGame(gameState);
    maintainDrawTwoTargetVisual();
    animateRemoteDiscard(previousState, gameState, remoteDiscardSource);
    animateRemoteDraw(remoteDrawEvent, gameState);
  });

  // Real-time UNO Call
  socket.on('uno_called', ({ playerName, message }) => {
    showToast(message || `📣 ${playerName} called UNO!`);
  });

  // Error Messages
  socket.on('error_message', (msg) => {
    appState.pendingAction = null;
    cancelDiscardFlight();
    showToast(msg || 'An error occurred.');
  });

  // Game Over
  socket.on('game_over', ({ winnerName, winnerId, message, matchId, wager }) => {
    const titleEl = document.getElementById('game-winner-title');
    const msgEl = document.getElementById('game-winner-message');
    const modalEl = document.getElementById('game-over-modal');

    if (titleEl) titleEl.textContent = `${(winnerName || 'WINNER').toUpperCase()} WINS!`;
    const restartButton = document.getElementById('btn-restart');
    if (restartButton) restartButton.classList.toggle('hidden', !appState.isHost);
    let payout = 0;
    const matchStake = Number(wager?.stake ?? appState.stake ?? 50);
    const settledMatchId = matchId || appState.matchRewardId;
    if (!appState.isAdmin && matchStake > 0 && window.UnoEconomy && settledMatchId) {
      const isLocalWinner = winnerId
        ? String(winnerId) === String(appState.myPlayerId || socket.id)
        : String(winnerName || '').trim().toLowerCase() === String(appState.playerName || '').trim().toLowerCase();
      const playerCount = Number(wager?.playerCount || appState.targetPlayers || 2);
      payout = isLocalWinner ? matchStake * playerCount : 0;
      appState.matchRewardId = null;
    }
    if (msgEl) msgEl.textContent = appState.isAdmin || matchStake === 0
      ? `${message || `${winnerName} has won the match!`} Admin mode: no coins were spent or awarded.`
      : `${message || `${winnerName} has won the match!`} ${payout ? `You won the ${payout} coin pot!` : `Your ${appState.stake} coin stake was lost.`}`.trim();
    if (modalEl) modalEl.classList.remove('hidden');
  });

  // ==========================================================================
  // AUTHORITATIVE RENDERING ENGINE (100% Reactive to Server gameState)
  // ==========================================================================

  function updatePlayersLobbyList(players) {
    const listEl = document.getElementById('players-list');
    const countEl = document.getElementById('player-count');

    if (!listEl || !countEl || !Array.isArray(players)) return;

    listEl.innerHTML = '';
    countEl.textContent = players.length;

    players.forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span><i class="fa-solid fa-user"></i> ${p.name}</span>
        ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
      `;
      listEl.appendChild(li);
    });

    const startButton = document.getElementById('btn-start-game');
    if (startButton && appState.mode === 'lan' && appState.isHost) {
      const ready = players.length === appState.targetPlayers;
      startButton.disabled = !ready;
      startButton.title = ready ? 'Start the wager match' : `Waiting for ${appState.targetPlayers - players.length} more player(s)`;
    }
  }

  // ==========================================================================
  // GHOST CARD ANIMATION ENGINE
  // ==========================================================================

  function animateCardFlight(fromElement, toElement, cardData, callback, targetRotation = 0) {
    if (!fromElement || !toElement) {
      if (typeof callback === 'function') callback();
      return;
    }

    const fromRect = fromElement.getBoundingClientRect();
    const toRect = toElement.getBoundingClientRect();

    let overlay = document.getElementById('ghost-animation-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ghost-animation-overlay';
      overlay.style.cssText = 'position: fixed; inset: 0; pointer-events: none; z-index: 9999; overflow: hidden;';
      document.body.appendChild(overlay);
    }

    const isFaceUp = Boolean(cardData && cardData.color && cardData.value);
    const ghostEl = create3DCardElement(isFaceUp ? cardData : null, 0, 0, !isFaceUp);
    ghostEl.classList.add('ghost-card-anim');

    // Dynamically read width and height of an actual reference card on the board (e.g. .card-3d or draw deck)
    const referenceCard = document.querySelector('.card-3d') || document.querySelector('.deck-3d-stack') || fromElement;
    const refRect = referenceCard ? referenceCard.getBoundingClientRect() : { width: 84, height: 128 };
    const cardWidth = refRect.width || 84;
    const cardHeight = refRect.height || 128;

    // Calculate source and target center positions
    const sourceX = fromRect.left + (fromRect.width - cardWidth) / 2;
    const sourceY = fromRect.top + (fromRect.height - cardHeight) / 2;

    const targetX = toRect.left + (toRect.width - cardWidth) / 2;
    const targetY = toRect.top + (toRect.height - cardHeight) / 2;

    ghostEl.style.position = 'absolute';
    ghostEl.style.left = `${sourceX}px`;
    ghostEl.style.top = `${sourceY}px`;
    ghostEl.style.width = `${cardWidth}px`;
    ghostEl.style.height = `${cardHeight}px`;
    ghostEl.style.transform = 'translate3d(0, 0, 0) scale(1) rotate(0deg)';
    ghostEl.style.transformOrigin = 'center center';

    overlay.appendChild(ghostEl);
    ghostEl.offsetWidth; // force reflow

    const deltaX = targetX - sourceX;
    const deltaY = targetY - sourceY;

    // Apply translation and target rotation strictly at scale(1) to prevent scale bloat
    ghostEl.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(1) rotate(${targetRotation}deg)`;

    let isFinished = false;
    const cleanup = () => {
      if (isFinished) return;
      isFinished = true;
      ghostEl.remove();
      if (typeof callback === 'function') {
        callback();
      }
    };

    ghostEl.addEventListener('transitionend', cleanup, { once: true });
    setTimeout(cleanup, 700);
  }

  window.animateCardFlight = animateCardFlight;

  function getTargetRotationForPlayer(playerId, players, myId) {
    const isMe = (String(playerId) === String(myId) || !players.find(p => String(p.id) === String(playerId))?.isBot && playerId === myId);
    if (isMe) return 0;

    let myIndex = players.findIndex(p => String(p.id) === String(myId));
    if (myIndex === -1) myIndex = 0;

    const targetIndex = players.findIndex(p => String(p.id) === String(playerId));
    if (targetIndex === -1) return 0;

    const relPos = (targetIndex - myIndex + players.length) % players.length;
    const relativePlayersCount = players.length - 1;

    let posName = 'top';
    if (relativePlayersCount === 1) {
      posName = 'top';
    } else if (relativePlayersCount === 2) {
      posName = (relPos === 1) ? 'left' : 'right';
    } else if (relativePlayersCount === 3) {
      if (relPos === 1) posName = 'left';
      else if (relPos === 2) posName = 'top';
      else if (relPos === 3) posName = 'right';
    }

    if (posName === 'top') return 180;
    if (posName === 'left') return 90;
    if (posName === 'right') return -90;
    return 0;
  }

  function appendCardToPlayerBundle(cardData, index) {
    const handContainer = document.getElementById('player-cards-fan');
    if (!handContainer) return null;

    const cardEl = create3DCardElement(cardData, index, 0, false);
    cardEl.style.position = 'absolute';
    cardEl.style.bottom = '0';
    cardEl.style.transformOrigin = 'bottom center';
    cardEl.style.zIndex = index;
    cardEl.style.transition = 'none';
    cardEl.style.transform = `translateX(0px) translateY(${index * -1.5}px) rotateZ(0deg) scale(0.95)`;
    cardEl.style.setProperty('--x', 0);
    cardEl.style.setProperty('--y', index * -1.5);
    cardEl.style.setProperty('--angle', 0);
    cardEl.style.setProperty('--index', index);
    cardEl.style.setProperty('--i', index);

    cardEl.addEventListener('click', () => {
      handleCardClick(cardData, cardEl, index);
    });

    handContainer.appendChild(cardEl);
    return cardEl;
  }

  function appendCardToOpponentBundle(position, index) {
    const stackContainer = document.getElementById(`opp-${position}-cards`);
    if (!stackContainer) return null;

    const countEl = document.getElementById(`opp-${position}-count`);
    if (countEl) {
      countEl.textContent = index + 1;
    }

    const cardEl = create3DCardElement(null, index, 0, true);
    cardEl.style.position = 'absolute';
    cardEl.style.bottom = '0';
    cardEl.style.transformOrigin = 'bottom center';
    cardEl.style.zIndex = index;
    cardEl.style.transition = 'none';
    cardEl.style.transform = `translateX(0px) translateY(${index * -1.5}px) rotateZ(0deg) scale(0.75)`;
    cardEl.style.setProperty('--index', index);
    cardEl.style.setProperty('--i', index);

    stackContainer.appendChild(cardEl);
    return cardEl;
  }

  function getOpponentPositionName(playerId, players, myId) {
    let myIndex = players.findIndex(p => String(p.id) === String(myId));
    if (myIndex === -1) myIndex = 0;

    const targetIndex = players.findIndex(p => String(p.id) === String(playerId));
    if (targetIndex === -1) return null;

    const relPos = (targetIndex - myIndex + players.length) % players.length;
    const relativePlayersCount = players.length - 1;

    if (relativePlayersCount === 1) return 'top';
    if (relativePlayersCount === 2) return (relPos === 1) ? 'left' : 'right';
    if (relativePlayersCount === 3) {
      if (relPos === 1) return 'left';
      if (relPos === 2) return 'top';
      if (relPos === 3) return 'right';
    }
    return 'top';
  }

  function renderDiscardPile(topCard, landedRotation = 5) {
    const discardPileContainer = document.getElementById('discard-pile-3d');
    if (!discardPileContainer) return;
    const cardSignature = topCard
      ? JSON.stringify([String(topCard.id ?? ''), topCard.color ?? '', topCard.value ?? '', landedRotation])
      : 'empty';
    if (discardPileContainer.dataset.cardSignature === cardSignature) return;
    discardPileContainer.dataset.cardSignature = cardSignature;
    discardPileContainer.innerHTML = '';
    if (topCard) {
      for (let i = 0; i < 2; i++) {
        const underlayCard = create3DCardElement(null, i, (i * 4) - 4, true);
        underlayCard.style.opacity = '0.35';
        discardPileContainer.appendChild(underlayCard);
      }
      const topCardEl = create3DCardElement(topCard, 2, landedRotation, false);
      discardPileContainer.appendChild(topCardEl);
    } else {
      discardPileContainer.innerHTML = '<div style="color: rgba(255,255,255,0.4); text-align: center; margin-top: 25px; font-weight: bold;">DISCARD EMPTY</div>';
    }
  }

  function animateDealSequence(state, onComplete) {
    const drawDeckEl = document.getElementById('draw-deck-3d');
    const discardPileEl = document.getElementById('discard-pile-3d');
    if (!drawDeckEl || !state || !Array.isArray(state.players)) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    const myId = appState.myPlayerId || socket.id;
    const playerDestMap = new Map();

    state.players.forEach(p => {
      // Every LAN player is human, so only this socket's player ID is our hand.
      const isMe = String(p.id) === String(myId);
      if (isMe) {
        const fanEl = document.getElementById('player-cards-fan');
        playerDestMap.set(p.id, fanEl || drawDeckEl);
      } else {
        const seatEl = getOpponentSeatElementForPlayer(p.id, state.players, myId);
        playerDestMap.set(p.id, seatEl || drawDeckEl);
      }
    });

    const totalCardsPerPlayer = 7;
    let animationQueue = [];

    // 1. Deal 7 cards to each player
    for (let cardRound = 0; cardRound < totalCardsPerPlayer; cardRound++) {
      state.players.forEach((p, pIdx) => {
        const isMe = String(p.id) === String(myId);
        const destEl = playerDestMap.get(p.id) || drawDeckEl;
        const targetRot = getTargetRotationForPlayer(p.id, state.players, myId);
        animationQueue.push({
          type: 'player',
          playerId: p.id,
          isMe: isMe,
          cardData: isMe ? (state.myHand && state.myHand[cardRound] ? state.myHand[cardRound] : null) : null,
          destElement: destEl,
          targetRotation: targetRot,
          roundIndex: cardRound,
          delay: (cardRound * state.players.length + pIdx) * 120
        });
      });
    }

    // 2. Flip initial card to Discard Pile
    if (discardPileEl && state.topCard) {
      const discardDelay = animationQueue.length * 120 + 80;
      animationQueue.push({
        type: 'discard',
        playerId: null,
        cardData: state.topCard,
        destElement: discardPileEl,
        targetRotation: 0,
        delay: discardDelay
      });
    }

    let completedCount = 0;
    const totalAnimations = animationQueue.length;

    if (totalAnimations === 0) {
      window.isDealingOrFanning = false;
      appState.isDealing = false;
      appState.isDealingOrFanning = false;
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    animationQueue.forEach(item => {
      setTimeout(() => {
        animateCardFlight(drawDeckEl, item.destElement, item.cardData, () => {
          if (item.type === 'player') {
            if (item.isMe) {
              appendCardToPlayerBundle(item.cardData, item.roundIndex);
            } else {
              const seatPos = getOpponentPositionName(item.playerId, state.players, myId);
              if (seatPos) {
                appendCardToOpponentBundle(seatPos, item.roundIndex);
              }
            }
          } else if (item.type === 'discard') {
            renderDiscardPile(state.topCard);
          }

          completedCount++;
          if (completedCount >= totalAnimations) {
            // All cards have landed into tight bundles
            // 30ms pause then single-pass fanned transition
            setTimeout(() => {
              // 1. Fan out player cards
              const handContainer = document.getElementById('player-cards-fan');
              if (handContainer) {
                const cardEls = Array.from(handContainer.querySelectorAll('.card-3d'));
                cardEls.forEach(cardEl => cardEl.classList.add('fanning-transition'));
                relayoutPlayerHand(handContainer);
              }

              // 2. Fan out opponent cards
              ['left', 'top', 'right'].forEach(pos => {
                const stackContainer = document.getElementById(`opp-${pos}-cards`);
                if (stackContainer) {
                  const cardEls = Array.from(stackContainer.querySelectorAll('.card-3d'));
                  const totalCards = cardEls.length;
                  const maxSpreadAngle = 35;
                  const spreadWidth = totalCards > 1 ? Math.min(220, totalCards * 25) : 0;

                  cardEls.forEach((cardEl, idx) => {
                    const angle = totalCards > 1 ? - (maxSpreadAngle / 2) + (idx * (maxSpreadAngle / (totalCards - 1))) : 0;
                    const targetX = totalCards > 1 ? - (spreadWidth / 2) + (idx * (spreadWidth / (totalCards - 1))) : 0;
                    const targetY = Math.abs(angle) * 0.5;

                    cardEl.style.setProperty('--i', idx);
                    cardEl.classList.add('fanning-transition');
                    cardEl.style.transform = `translateX(${targetX}px) translateY(${targetY}px) rotateZ(${angle}deg) scale(0.75)`;
                  });
                }
              });

              // 3. Once transition completes (600ms), unlock animation state and render
              setTimeout(() => {
                // Clear fanning transition class
                if (handContainer) {
                  handContainer.querySelectorAll('.card-3d').forEach(cardEl => {
                    cardEl.classList.remove('fanning-transition');
                    cardEl.style.transition = '';
                  });
                }
                ['left', 'top', 'right'].forEach(pos => {
                  const stackContainer = document.getElementById(`opp-${pos}-cards`);
                  if (stackContainer) {
                    stackContainer.querySelectorAll('.card-3d').forEach(cardEl => {
                      cardEl.classList.remove('fanning-transition');
                      cardEl.style.transition = '';
                    });
                  }
                });

                window.isDealingOrFanning = false;
                appState.isDealing = false;
                appState.isDealingOrFanning = false;

                // The deal animation has already built and fanned the exact
                // hand DOM. Mark it as rendered so the completion snapshot
                // does not tear it down and recreate it (visible as a blink).
                if (handContainer && Array.isArray(state.myHand)) {
                  handContainer.dataset.handSignature = getHandSignature(state.myHand);
                }

                if (typeof onComplete === 'function') {
                  onComplete();
                }
              }, 600);
            }, 30);
          }
        }, item.targetRotation);
      }, item.delay);
    });
  }

  function getHandSignature(cards) {
    return JSON.stringify(cards.map(card => card
      ? [String(card.id ?? ''), card.color ?? '', card.value ?? '']
      : null));
  }

  function getOpponentSeatElementForPlayer(playerId, players, myId) {
    let myIndex = players.findIndex(p => String(p.id) === String(myId));
    if (myIndex === -1) myIndex = 0;
    
    const targetIndex = players.findIndex(p => String(p.id) === String(playerId));
    if (targetIndex === -1) return null;

    const relPos = (targetIndex - myIndex + players.length) % players.length;
    const relativePlayersCount = players.length - 1;

    let posName = 'top';
    if (relativePlayersCount === 1) {
      posName = 'top';
    } else if (relativePlayersCount === 2) {
      posName = (relPos === 1) ? 'left' : 'right';
    } else if (relativePlayersCount === 3) {
      if (relPos === 1) posName = 'left';
      else if (relPos === 2) posName = 'top';
      else if (relPos === 3) posName = 'right';
    }

    return document.querySelector(`.seat-${posName}`) || document.getElementById(`opp-${posName}-cards`);
  }

  /**
   * Primary Authoritative UI Render Function
   * Renders the entire game table strictly according to the server's gameState contract.
   */
  function renderGame(state, discardRotation = 5) {
    if (!state) {
      console.warn('[renderGame] Empty or invalid state received');
      return;
    }

    if (window.isDealingOrFanning) {
      return;
    }

    const discardFlight = window.pendingDiscardFlight;
    if (discardFlight && Array.isArray(state.myHand)
      && !state.myHand.some(card => String(card?.id) === String(discardFlight.card.id))) {
      discardFlight.state = state;
      if (discardFlight.landed) finishDiscardFlight(discardFlight);
      return;
    }

    const drawFlight = window.pendingDrawGhost;
    if (drawFlight && Array.isArray(state.myHand) && state.myHand.length > drawFlight.baseCount) {
      const drawnCard = state.myHand.find(card => !drawFlight.baseIds.has(String(card?.id)));
      if (drawnCard) {
        drawFlight.state = state;
        drawFlight.card = drawnCard;
        revealDrawGhost(drawFlight);
        return;
      }
    }

    // 1. Update Direction Flow Ring
    const directionRing = document.getElementById('direction-ring-3d');
    if (directionRing) {
      const reverseTransition = window.pendingReverseTransition;
      if (!reverseTransition || Number(reverseTransition.to) !== Number(state.direction)) {
        directionRing.className = `direction-ring-3d ${state.direction === -1 ? 'counter-clockwise' : 'clockwise'}`;
      }
    }

    // 2. Active player identification & turn indicators
    const myId = appState.myPlayerId || socket.id;
    const isMyTurn = (state.isMyTurn !== undefined)
      ? Boolean(state.isMyTurn)
      : (state.currentTurnPlayerId && String(state.currentTurnPlayerId) === String(myId));

    appState.isMyTurn = isMyTurn;
    appState.canDraw = (state.canDraw !== undefined) ? Boolean(state.canDraw) : Boolean(isMyTurn && !state.hasDrawnThisTurn);
    appState.canPass = (state.canPass !== undefined) ? Boolean(state.canPass) : false;

    const myTitleEl = document.querySelector('.my-title');
    if (myTitleEl) {
      if (isMyTurn) {
        myTitleEl.classList.add('active-turn');
        if (myTitleEl.dataset.turnLabel !== 'active') {
          myTitleEl.innerHTML = `<i class="fa-solid fa-play"></i> YOUR TURN!`;
          myTitleEl.dataset.turnLabel = 'active';
        }
      } else {
        myTitleEl.classList.remove('active-turn');
        const turnLabel = state.currentTurnPlayerName
          ? `${state.currentTurnPlayerName}'s Turn`
          : 'Your Hand';
        if (myTitleEl.dataset.turnLabel !== turnLabel) {
          myTitleEl.textContent = turnLabel;
          myTitleEl.dataset.turnLabel = turnLabel;
        }
      }
    }

    // 3. Dynamic 3D Table Glow representing current color
    const tablePlate = document.querySelector('.table-3d-plate');
    if (tablePlate) {
      const rawColor = state.currentColor || (state.topCard ? state.topCard.color : 'red');
      const activeColor = ['red', 'blue', 'green', 'yellow'].includes(rawColor) ? rawColor : 'red';
      const colorRgb = { red: '255,51,51', blue: '0,102,255', green: '34,204,34', yellow: '255,204,0' };
      const colorHex = { red: '#ff3333', blue: '#0066ff', green: '#22cc22', yellow: '#ffcc00' };
      if (tablePlate.dataset.activeColor !== activeColor) {
        tablePlate.dataset.activeColor = activeColor;
        document.documentElement.style.setProperty('--active-game-rgb', colorRgb[activeColor]);
        document.documentElement.style.setProperty('--active-game-color', colorHex[activeColor]);
        tablePlate.style.boxShadow = `0 15px 40px rgba(0, 0, 0, 0.6),
                                    inset 0 0 45px rgba(0, 0, 0, 0.8),
                                    0 0 30px var(--uno-${activeColor})`;
      }
    }

    // 4. Render center discard pile
    renderDiscardPile(state.topCard, discardRotation);

    // 5. Render opponent seating
    setupOpponentsSeating(state);

    // 6. Defensive Array Checks as mandated by Architecture Contract
    if (!state.myHand || !Array.isArray(state.myHand)) {
      console.error("Invalid hand received", state);
      return;
    }

    // Toggle Pass Turn button safely
    const passBtn = document.getElementById('btn-pass-turn');
    if (passBtn) {
      if (appState.canPass) {
        passBtn.classList.remove('hidden');
      } else {
        passBtn.classList.add('hidden');
      }
    }

    // Toggle Draw Deck visual highlight
    const drawDeck = document.getElementById('draw-deck-3d');
    if (drawDeck) {
      if (appState.canDraw && appState.isMyTurn) {
        drawDeck.classList.add('can-draw-highlight');
      } else {
        drawDeck.classList.remove('can-draw-highlight');
      }
    }

    // Render active player hand (3D Fan layout)
    const handContainer = document.getElementById('player-cards-fan');
    if (handContainer) {
      const cardsToRender = state.myHand;
      const handSignature = getHandSignature(cardsToRender);

      // Other players' moves update the whole game snapshot, but do not change
      // this player's hand. Keep existing card DOM in that case so the hand
      // does not collapse and fan out again on every opponent move.
      if (handContainer.dataset.handSignature !== handSignature) {
        handContainer.dataset.handSignature = handSignature;
        handContainer.classList.add('draw-layout-sync');
        handContainer.innerHTML = '';
        const totalCards = cardsToRender.length;
        const renderedCards = [];

        cardsToRender.forEach((card, idx) => {
          if (!card) return;
          const isDrawReveal = window.drawRevealCardId != null && String(card.id) === String(window.drawRevealCardId);
          const cardEl = isDrawReveal
            ? createDrawRevealCardElement(card, idx)
            : create3DCardElement(card, idx, 0, false);
          cardEl.dataset.cardId = String(card.id);

          if (appState.selectedCardId && String(card.id) === String(appState.selectedCardId)) {
            cardEl.classList.add('selected');
          }

          if (!isDrawReveal && state.lastDrawnCardId && String(card.id) === String(state.lastDrawnCardId)) {
            cardEl.classList.add('just-drawn');
          }

          cardEl.addEventListener('click', () => {
            handleCardClick(card, cardEl, idx);
          });

          handContainer.appendChild(cardEl);
          renderedCards.push(cardEl);
        });
        if (window.drawRevealCardId != null) window.drawRevealCardId = null;

        relayoutPlayerHand(handContainer);
        requestAnimationFrame(() => handContainer.classList.remove('draw-layout-sync'));
      }
    }
  }

  // Global exports for backwards compatibility
  window.renderGame = renderGame;
  window.renderGameBoard = renderGame;

  /**
   * Positions opponents around table relative to current player
   */
  function setupOpponentsSeating(state) {
    const seatTop = document.querySelector('.seat-top');
    const seatLeft = document.querySelector('.seat-left');
    const seatRight = document.querySelector('.seat-right');

    if (!state || !Array.isArray(state.players)) {
      if (seatTop) seatTop.classList.add('hidden');
      if (seatLeft) seatLeft.classList.add('hidden');
      if (seatRight) seatRight.classList.add('hidden');
      return;
    }

    const myId = appState.myPlayerId || socket.id;
    let myIndex = state.players.findIndex(p => String(p.id) === String(myId));
    if (myIndex === -1) {
      // Fallback: in vs-AI mode, select the human non-bot player
      myIndex = state.players.findIndex(p => !p.isBot);
      if (myIndex === -1) myIndex = 0;
    }

    const relativePlayers = [];
    for (let i = 1; i < state.players.length; i++) {
      const idx = (myIndex + i) % state.players.length;
      relativePlayers.push(state.players[idx]);
    }

    let leftPlayer = null;
    let topPlayer = null;
    let rightPlayer = null;

    if (relativePlayers.length === 1) {
      topPlayer = relativePlayers[0];
    } else if (relativePlayers.length === 2) {
      leftPlayer = relativePlayers[0];
      rightPlayer = relativePlayers[1];
    } else if (relativePlayers.length === 3) {
      leftPlayer = relativePlayers[0];
      topPlayer = relativePlayers[1];
      rightPlayer = relativePlayers[2];
    }

    if (seatLeft) seatLeft.classList.toggle('hidden', !leftPlayer);
    if (seatTop) seatTop.classList.toggle('hidden', !topPlayer);
    if (seatRight) seatRight.classList.toggle('hidden', !rightPlayer);
    if (leftPlayer) bindSeatData('left', leftPlayer, state.currentTurnPlayerId);
    if (topPlayer) bindSeatData('top', topPlayer, state.currentTurnPlayerId);
    if (rightPlayer) bindSeatData('right', rightPlayer, state.currentTurnPlayerId);
  }

  function bindSeatData(position, player, currentTurnPlayerId) {
    const nameEl = document.getElementById(`opp-${position}-name`);
    if (nameEl) {
      const playerId = String(player.id ?? '');
      const signature = `${playerId}:${player.name || ''}:${Boolean(player.isBot)}`;
      if (nameEl.dataset.playerSignature !== signature) {
        nameEl.dataset.playerSignature = signature;
        nameEl.innerHTML = player.isBot
          ? `<i class="fa-solid fa-robot"></i> ${player.name}`
          : `<i class="fa-solid fa-user-astronaut"></i> ${player.name}`;
      }
    }

    const countEl = document.getElementById(`opp-${position}-count`);
    const cardCount = typeof player.cardCount === 'number'
      ? player.cardCount
      : (Number.isFinite(player.cardCount) ? player.cardCount : (Array.isArray(player.hand) ? player.hand.length : (player.handLength || 0)));

    if (countEl && !window.isDealingOrFanning && countEl.textContent !== String(cardCount)) {
      countEl.textContent = cardCount;
    }

    const isCurrentTurn = Boolean(player.id && String(player.id) === String(currentTurnPlayerId));

    const oppSeat = document.querySelector(`.seat-${position}`);
    if (oppSeat) oppSeat.classList.toggle('active-turn', isCurrentTurn);

    const oppInfoEl = document.querySelector(`.seat-${position} .opp-info`);
    if (oppInfoEl) oppInfoEl.classList.toggle('active-turn', isCurrentTurn);

    const oppCardEl = document.querySelector(`.seat-${position} .opponent-card`);
    if (oppCardEl) oppCardEl.classList.toggle('active-turn', isCurrentTurn);

    // Do NOT spawn or wipe opponent cards while dealing or fanning is active!
    if (window.isDealingOrFanning) {
      return;
    }

    const stackContainer = document.getElementById(`opp-${position}-cards`);
    if (stackContainer) {
      let existingCount = stackContainer.querySelectorAll('.card-3d').length;
      // Keep the already-fanned cards when only turn metadata changed. The
      // end-of-deal snapshot has the same counts as the animated bundles, so
      // replacing those nodes here caused a visible one-frame flash.
      if (existingCount !== cardCount) {
        stackContainer.innerHTML = '';
        existingCount = 0;
      }
      for (let i = existingCount; i < cardCount; i++) {
        const cardEl = create3DCardElement(null, i, 0, true);

        const maxSpreadAngle = 35;
        const angle = cardCount > 1
          ? - (maxSpreadAngle / 2) + (i * (maxSpreadAngle / (cardCount - 1)))
          : 0;

        const spreadWidth = cardCount > 1 ? Math.min(220, cardCount * 25) : 0;
        const targetX = cardCount > 1
          ? - (spreadWidth / 2) + (i * (spreadWidth / (cardCount - 1)))
          : 0;
        const targetY = Math.abs(angle) * 0.5;
        const targetRot = angle;

        cardEl.style.setProperty('--index', i);
        cardEl.style.setProperty('--i', i);
        cardEl.style.position = 'absolute';
        cardEl.style.transformOrigin = 'bottom center';
        cardEl.style.zIndex = i;
        cardEl.style.transform = `translateX(${targetX}px) translateY(${targetY}px) rotateZ(${targetRot}deg) scale(0.75)`;

        stackContainer.appendChild(cardEl);
      }
    }
  }

  /**
   * Creates a 3D UNO Card Element (Face Front or Card Back)
   */
  function create3DCardElement(card, index = 0, angle = 0, isBack = false, themeId = document.documentElement.dataset.deckTheme) {
    const cardEl = document.createElement('div');
    const isCyberpunk = themeId === 'cyberpunk';

    if (isBack) {
      cardEl.className = 'card-3d card-back';
      if (isCyberpunk) cardEl.classList.add('cyberpunk-deck-back');
      cardEl.style.setProperty('--i', index);
      cardEl.innerHTML = isCyberpunk ? `
        <div class="card-inner cyber-back-inner">
          <div class="cyber-scanline-overlay"></div>
          <div class="cyber-back-hud"><span>SECURE_DATA_CARD</span><span>ENCRYPTED</span></div>
          <div class="cyber-back-emblem">
            <div class="cyber-back-orbit"><i class="fa-solid fa-microchip"></i></div>
            <strong>UNO</strong>
            <small>CYBERPUNK ED.</small>
          </div>
          <div class="cyber-back-footer"><span>ID: 0x90A2F</span><span>NEO-TOKYO 2077</span></div>
        </div>
      ` : `
        <div class="card-inner">
          <div class="card-inner-ellipse"></div>
        </div>
      `;
      return cardEl;
    }

    const safeCard = card || { color: 'red', value: '0', type: 'number' };
    const isWild = (safeCard.color === 'wild' || safeCard.color === 'wild_draw4' || safeCard.value === 'wild' || safeCard.value === 'wild_draw4');
    const colorClass = isWild ? 'card-black' : `card-${safeCard.color}`;
    const displayVal = getCardDisplayValue(safeCard.value);
    const displayIcon = getCardDisplayIcon(safeCard.value);
    const cardValueText = String(safeCard.value || '0').toUpperCase();
    const cyberDisplayVal = displayIcon ? cardValueText : displayVal;
    const safeDisplayVal = cyberDisplayVal.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const safeCardValue = cardValueText.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const subtitle = ({ skip: 'SYSTEM OVERRIDE', reverse: 'SIGNAL REVERSAL', draw2: 'BUFFER OVERFLOW', wild: 'WILD SIGNAL', wild_draw4: 'CORE MELTDOWN' })[String(safeCard.value)] || (isWild ? 'WILD SIGNAL' : 'DATA NODE');

    cardEl.className = `card-3d card-front ${colorClass}`;
    if (isCyberpunk) cardEl.classList.add('cyberpunk-card-face', 'glitch-active');
    cardEl.style.setProperty('--i', index);
    cardEl.style.setProperty('--r', angle);

    cardEl.innerHTML = isCyberpunk ? `
      <div class="card-inner cyber-front-inner">
        <div class="cyber-holo-foil"></div>
        <div class="cyber-scanline-overlay"></div>
        <div class="cyber-hud-top">
          <div class="cyber-corner-value"><strong class="glitch-element" data-text="${safeDisplayVal}">${safeDisplayVal}</strong><small>SYS.${safeCardValue.padStart(2, '0')}</small></div>
          <div class="cyber-status"><i></i><span>READY</span></div>
        </div>
        <div class="cyber-front-center">
          <div class="cyber-orbit-ring"></div>
          <div class="cyber-value-badge">
            <div class="cyber-center-value pulse-neon glitch-element" data-text="${safeDisplayVal}">${displayIcon ? `<i class="${displayIcon}"></i>` : safeDisplayVal}</div>
            <div class="cyber-subtitle">${subtitle}</div>
          </div>
        </div>
        <div class="cyber-hud-bottom">
          <div class="cyber-corner-value"><strong class="glitch-element" data-text="${safeDisplayVal}">${safeDisplayVal}</strong><small>SYS.${safeCardValue.padStart(2, '0')}</small></div>
          <span>CYBER_UNO // REV_2.0</span>
        </div>
        <i class="cyber-tech-corner top-left"></i><i class="cyber-tech-corner top-right"></i>
        <i class="cyber-tech-corner bottom-left"></i><i class="cyber-tech-corner bottom-right"></i>
      </div>
    ` : `
      <div class="card-inner">
        <div class="card-corner top-left">${displayVal}</div>
        <div class="card-inner-ellipse">
          ${displayIcon
            ? `<i class="${displayIcon}"></i>`
            : `<span class="card-center-val">${displayVal}</span>`
          }
        </div>
        <div class="card-corner bottom-right">${displayVal}</div>
      </div>
    `;

    return cardEl;
  }

  function getCardDisplayValue(val) {
    switch (String(val)) {
      case 'skip': return '🚫';
      case 'reverse': return '🔄';
      case 'draw2': return '+2';
      case 'wild': return '🎨';
      case 'wild_draw4': return '+4';
      default: return val || '';
    }
  }

  function getCardDisplayIcon(val) {
    switch (String(val)) {
      case 'skip': return 'fa-solid fa-ban';
      case 'reverse': return 'fa-solid fa-arrows-rotate';
      case 'wild': return 'fa-solid fa-wand-magic-sparkles';
      default: return null;
    }
  }

  function captureReverseTransition(previousState, nextState) {
    const played = nextState?.lastPlayedCard;
    if (!previousState?.topCard || !nextState?.topCard || !played
      || String(nextState.topCard.value).toLowerCase() !== 'reverse'
      || String(previousState.topCard.id) === String(nextState.topCard.id)
      || String(played.cardId) !== String(nextState.topCard.id)
      || Number(previousState.direction) === Number(nextState.direction)) return;
    window.pendingReverseTransition = {
      from: previousState.direction,
      to: nextState.direction,
      signature: `${played.playerId}:${played.cardId}`
    };
  }

  function animateReverseFlight(ghost, overlay, flight) {
    const duration = 650;
    const trail = document.createElement('div');
    trail.className = 'reverse-flight-trail';
    Object.assign(trail.style, {
      left: `${flight.startX + flight.width * .15}px`,
      top: `${flight.startY + flight.height * .68}px`,
      width: `${flight.width * .7}px`,
      height: `${Math.max(8, flight.height * .13)}px`
    });
    overlay.appendChild(trail);
    ghost.style.transition = 'none';
    const midTransform = `translate3d(${flight.dx * .5}px,${flight.dy * .5 - flight.height * .8}px,0) scale(1) rotate(0deg)`;
    const endTransform = flight.endTransform;
    const cardAnimation = ghost.animate([
      { transform: flight.startTransform, offset: 0, easing: 'cubic-bezier(.2,.7,.3,1)' },
      { transform: midTransform, offset: .56, easing: 'cubic-bezier(.2,.7,.3,1)' },
      { transform: endTransform, offset: 1 }
    ], { duration, fill: 'forwards' });
    trail.animate([
      { transform: 'translate3d(0,0,0) scale(.45)', opacity: .9, offset: 0 },
      { transform: `translate3d(${flight.dx * .5}px,${flight.dy * .5 - flight.height * .8}px,0) scale(1.2)`, opacity: .72, offset: .56 },
      { transform: `translate3d(${flight.dx}px,${flight.dy}px,0) scale(.25)`, opacity: 0, offset: 1 }
    ], { duration, fill: 'forwards', easing: 'ease-out' });
    return { animation: cardAnimation, trail };
  }

  function animateDrawTwoSlamFlight(ghost, overlay, flight) {
    const trail = document.createElement('div');
    trail.className = 'draw2-slam-trail';
    const flightAngle = Math.atan2(flight.dy, flight.dx) * 180 / Math.PI;
    const trailLength = Math.max(48, Math.hypot(flight.dx, flight.dy));
    Object.assign(trail.style, {
      left: `${flight.startX + flight.width / 2}px`,
      top: `${flight.startY + flight.height / 2}px`,
      width: `${trailLength}px`,
      transform: `rotate(${flightAngle}deg) scaleX(.08)`
    });
    overlay.appendChild(trail);
    ghost.style.transition = 'none';
    const animation = ghost.animate([
      { transform: flight.startTransform, offset: 0, easing: 'cubic-bezier(.18,.72,.25,1)' },
      { transform: `translate3d(${flight.dx * .76}px,${flight.dy * .76 - 12}px,0) scale(1.04) rotate(-10deg)`, offset: .72, easing: 'cubic-bezier(.72,0,.96,.35)' },
      { transform: `translate3d(${flight.dx}px,${flight.dy}px,0) scale(1.1) rotate(4deg)`, offset: .9, easing: 'ease-out' },
      { transform: flight.endTransform, offset: 1 }
    ], { duration: 420, fill: 'forwards' });
    trail.animate([
      { opacity: .85, transform: `rotate(${flightAngle}deg) scaleX(.08)` },
      { opacity: 0, transform: `rotate(${flightAngle}deg) scaleX(1)` }
    ], { duration: 380, easing: 'ease-out', fill: 'forwards' });
    return { animation, trail };
  }

  function animateDrawFourSlamFlight(ghost, overlay, flight) {
    const trail = document.createElement('div');
    trail.className = 'draw4-slam-trail';
    const angle = Math.atan2(flight.dy, flight.dx) * 180 / Math.PI;
    Object.assign(trail.style, {
      left: `${flight.startX + flight.width / 2}px`,
      top: `${flight.startY + flight.height / 2}px`,
      width: `${Math.max(64, Math.hypot(flight.dx, flight.dy))}px`,
      transform: `rotate(${angle}deg) scaleX(.04)`
    });
    overlay.appendChild(trail);
    ghost.style.transition = 'none';
    const animation = ghost.animate([
      { transform: flight.startTransform, offset: 0, easing: 'cubic-bezier(.2,.72,.25,1)' },
      { transform: `translate3d(${flight.dx * .7}px,${flight.dy * .7 - flight.height * .42}px,0) scale(1.12) rotate(-9deg)`, offset: .68, easing: 'cubic-bezier(.6,.02,.95,.35)' },
      { transform: `translate3d(${flight.dx}px,${flight.dy - 13}px,0) scale(1.2) rotate(3deg)`, offset: .88, easing: 'cubic-bezier(.12,.86,.22,1)' },
      { transform: flight.endTransform, offset: 1 }
    ], { duration: 500, fill: 'forwards' });
    trail.animate([
      { opacity: 0, transform: `rotate(${angle}deg) scaleX(.04)` },
      { opacity: .98, offset: .34, transform: `rotate(${angle}deg) scaleX(1)` },
      { opacity: 0, transform: `rotate(${angle}deg) scaleX(.2)` }
    ], { duration: 500, easing: 'ease-out', fill: 'forwards' });
    return { animation, trail };
  }

  function animateWildSlamFlight(ghost, overlay, flight, chosenColor) {
    const chosen = ({ red: '#ff3038', green: '#22d34a', blue: '#258bff', yellow: '#ffd52a' })[chosenColor] || '#ff3038';
    const sheen = document.createElement('div');
    sheen.className = 'wild-color-reveal-sheen';
    ghost.appendChild(sheen);
    ghost.style.setProperty('--wild-chosen-color', chosen);
    ghost.style.transition = 'none';
    let cancelled = false;
    const activeAnimations = [];
    let resolveFinished;
    const finished = new Promise(resolve => { resolveFinished = resolve; });
    const animation = {
      finished,
      cancel() {
        if (cancelled) return;
        cancelled = true;
        activeAnimations.forEach(item => { try { item.cancel(); } catch (_) {} });
        sheen.remove();
        resolveFinished();
      }
    };
    const run = async () => {
      const mid = `translate3d(${flight.dx * .52}px,${flight.dy * .52 - flight.height * .42}px,0) scale(1.04) rotate(-4deg)`;
      const travel = ghost.animate([
        { transform: flight.startTransform, offset: 0, easing: 'cubic-bezier(.2,.7,.3,1)' },
        { transform: mid, offset: .56, easing: 'cubic-bezier(.25,.8,.35,1)' },
        { transform: flight.endTransform, offset: 1 }
      ], { duration: 500, fill: 'forwards' });
      activeAnimations.push(travel);
      await travel.finished.catch(() => {});
      if (cancelled) return;

      const reveal = sheen.animate([
        { opacity: 0, transform: 'translateX(-125%)' },
        { opacity: .88, offset: .38, transform: 'translateX(-15%)' },
        { opacity: .18, transform: 'translateX(125%)' }
      ], { duration: 330, fill: 'forwards', easing: 'ease-out' });
      activeAnimations.push(reveal);
      await reveal.finished.catch(() => {});
      if (cancelled) return;

      ghost.classList.add('wild-color-locked');
      const slam = ghost.animate([
        { transform: flight.endTransform, offset: 0, easing: 'cubic-bezier(.7,0,.9,.3)' },
        { transform: `translate3d(${flight.dx}px,${flight.dy - 10}px,0) scale(1.07) rotate(-2deg)`, offset: .55, easing: 'cubic-bezier(.12,.82,.25,1)' },
        { transform: `translate3d(${flight.dx}px,${flight.dy + 1}px,0) scale(.98) rotate(1deg)`, offset: .8 },
        { transform: flight.endTransform, offset: 1 }
      ], { duration: 150, fill: 'forwards' });
      activeAnimations.push(slam);
      await slam.finished.catch(() => {});
      if (!cancelled) resolveFinished();
    };
    run();
    return { animation, trail: { remove: () => sheen.remove() } };
  }

  function playReverseImpact(state) {
    if (!state) return;
    const played = state.lastPlayedCard;
    const signature = `${played?.playerId || ''}:${played?.cardId || state.topCard?.id || ''}`;
    if (signature === window.lastReverseImpactSignature) return;
    window.lastReverseImpactSignature = signature;

    const overlay = document.getElementById('ghost-animation-overlay');
    const pile = document.getElementById('discard-pile-3d');
    if (overlay && pile) {
      const rect = pile.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      for (let i = 0; i < 3; i++) {
        const ring = document.createElement('div');
        ring.className = 'reverse-impact-ring';
        ring.style.left = `${x}px`;
        ring.style.top = `${y}px`;
        ring.style.setProperty('--ring-delay', `${i * 110}ms`);
        overlay.appendChild(ring);
        setTimeout(() => ring.remove(), 1250);
      }

      const emblem = document.createElement('div');
      emblem.className = 'reverse-hologram-emblem';
      emblem.innerHTML = '<span class="reverse-emblem-glyph">⟳</span><strong>REVERSE</strong>';
      emblem.style.left = `${x}px`;
      emblem.style.top = `${y}px`;
      overlay.appendChild(emblem);
      setTimeout(() => emblem.remove(), 1450);

      for (let i = 0; i < 18; i++) {
        const spark = document.createElement('i');
        spark.className = 'reverse-impact-spark';
        spark.style.left = `${x}px`;
        spark.style.top = `${y}px`;
        spark.style.setProperty('--spark-angle', `${i * 20 + (Math.random() * 8 - 4)}deg`);
        spark.style.setProperty('--spark-distance', `${45 + Math.random() * 125}px`);
        spark.style.setProperty('--spark-delay', `${Math.random() * 90}ms`);
        overlay.appendChild(spark);
        setTimeout(() => spark.remove(), 850);
      }
    }

    const transition = window.pendingReverseTransition;
    animateReverseOrbit(state.direction, transition);
    animateReversePlayerWave(state, played?.playerId);
    playReverseSynthSound();
  }

  function playWildColorChange(color, state) {
    const activeColor = ['red', 'blue', 'green', 'yellow'].includes(String(color).toLowerCase())
      ? String(color).toLowerCase() : 'red';
    const cardId = state?.lastPlayedCard?.cardId || state?.topCard?.id || '';
    const signature = `${state?.lastPlayedCard?.playerId || ''}:${cardId}:${activeColor}`;
    if (signature === window.lastWildColorEffectSignature
      && Date.now() - (window.lastWildColorEffectAt || 0) < 1800) return;
    window.lastWildColorEffectSignature = signature;
    window.lastWildColorEffectAt = Date.now();

    const rgb = { red: '255,51,51', blue: '0,102,255', green: '34,204,34', yellow: '255,204,0' }[activeColor];
    const hex = { red: '#ff3333', blue: '#0066ff', green: '#22cc22', yellow: '#ffcc00' }[activeColor];
    document.documentElement.style.setProperty('--active-game-rgb', rgb);
    document.documentElement.style.setProperty('--active-game-color', hex);
    const table = document.querySelector('.table-3d-plate');
    if (table) table.style.boxShadow = `0 15px 40px rgba(0,0,0,.6), inset 0 0 45px rgba(0,0,0,.8), 0 0 36px var(--uno-${activeColor})`;
    const discardTop = document.querySelector('#discard-pile-3d .card-3d:last-child');
    if (discardTop) {
      discardTop.classList.add('wild-color-locked');
      discardTop.style.setProperty('--wild-chosen-color', hex);
    }
    playWildColorImpact(state, hex);
    playWildColorChord(activeColor);
  }
  function playWildColorImpact(state, color) {
    const pile = document.getElementById('discard-pile-3d');
    if (pile) {
      const rect = pile.getBoundingClientRect();
      const ring = document.createElement('div');
      ring.className = 'wild-color-impact-ring';
      ring.style.left = `${rect.left + rect.width / 2}px`;
      ring.style.top = `${rect.top + rect.height / 2}px`;
      ring.style.setProperty('--wild-chosen-color', color || '#ff3038');
      document.body.appendChild(ring);
      setTimeout(() => ring.remove(), 600);
    }
    const table = document.querySelector('.table-3d-plate');
    const atmosphere = document.querySelector('.app-background-glow');
    const pulseElements = [table, atmosphere].filter(Boolean);
    const cards = document.querySelectorAll('#player-cards-fan .card-3d, #opp-top-cards .card-3d, #opp-left-cards .card-3d, #opp-right-cards .card-3d');
    cards.forEach((card, index) => {
      card.style.setProperty('--wild-bounce-delay', `${(index % 8) * 18}ms`);
    });
    pulseElements.forEach(element => {
      element.classList.add('wild-color-impact-pulse');
      setTimeout(() => element.classList.remove('wild-color-impact-pulse'), 760);
    });
    cards.forEach(card => {
      card.classList.add('wild-card-impact-bounce');
      setTimeout(() => card.classList.remove('wild-card-impact-bounce'), 700);
    });
  }

  function playWildColorChord(color) {
    if (document.getElementById('sound-status')?.textContent?.trim() === 'OFF') return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const chords = {
      red: [261.63, 329.63, 392],
      blue: [220, 277.18, 329.63],
      green: [293.66, 369.99, 440],
      yellow: [329.63, 415.3, 493.88]
    };
    try {
      const audio = new AudioContextClass();
      const now = audio.currentTime;
      chords[color].forEach((frequency, index) => {
        const oscillator = audio.createOscillator();
        const envelope = audio.createGain();
        oscillator.type = index === 1 ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.detune.setValueAtTime(index === 0 ? -7 : index === 2 ? 7 : 0, now);
        envelope.gain.setValueAtTime(.0001, now);
        envelope.gain.exponentialRampToValueAtTime(.1 / (index + 1), now + .045 + index * .025);
        envelope.gain.exponentialRampToValueAtTime(.0001, now + .72);
        oscillator.connect(envelope).connect(audio.destination);
        oscillator.start(now + index * .025);
        oscillator.stop(now + .75);
      });
      audio.resume().catch(() => {});
      setTimeout(() => audio.close().catch(() => {}), 950);
    } catch (_) {
      // Audio can be unavailable until a browser gesture unlocks it.
    }
  }

  function animateReverseOrbit(direction, transition) {
    const ring = document.getElementById('direction-ring-3d');
    if (!ring) return;
    if (!ring.querySelector('.orbit-flow-particle')) {
      for (let i = 0; i < 8; i++) {
        const particle = document.createElement('i');
        particle.className = 'orbit-flow-particle';
        particle.style.setProperty('--orbit-angle', `${i * 45}deg`);
        ring.appendChild(particle);
      }
    }
    const nextClass = Number(direction) === -1 ? 'counter-clockwise' : 'clockwise';
    if (!transition) {
      ring.className = `direction-ring-3d ${nextClass}`;
      return;
    }

    const transform = getComputedStyle(ring).transform;
    let currentAngle = 0;
    try {
      if (window.DOMMatrixReadOnly) {
        const matrix = new window.DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
        currentAngle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
      } else {
        const values = transform.match(/matrix\(([^)]+)\)/)?.[1].split(',').map(Number);
        if (values?.length >= 2) currentAngle = Math.atan2(values[1], values[0]) * 180 / Math.PI;
      }
    } catch (_) {}
    ring.getAnimations().forEach(animation => animation.cancel());
    ring.style.animation = 'none';
    ring.style.transition = 'none';
    ring.style.transform = `translate(-50%,-50%) rotate(${currentAngle}deg)`;
    const targetAngle = currentAngle + 180;
    const rotate = ring.animate([
      { transform: `translate(-50%,-50%) rotate(${currentAngle}deg)` },
      { transform: `translate(-50%,-50%) rotate(${targetAngle}deg)` }
    ], { duration: 820, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'forwards' });
    rotate.finished.then(() => {
      rotate.cancel();
      const phase = ((targetAngle % 360) + 360) % 360;
      const phaseFraction = nextClass === 'clockwise' ? phase / 360 : ((360 - phase) % 360) / 360;
      ring.className = `direction-ring-3d ${nextClass}`;
      ring.style.animation = '';
      ring.style.animationDelay = `${-phaseFraction * 10}s`;
      ring.style.transform = '';
      ring.style.transition = '';
      window.pendingReverseTransition = null;
    }).catch(() => {});
  }

  function animateReversePlayerWave(state, actorId) {
    const players = state.players || [];
    if (!players.length) return;
    const actorIndex = players.findIndex(player => String(player.id) === String(actorId));
    const direction = Number(state.direction) === -1 ? -1 : 1;
    players.forEach((_, step) => {
      const order = step + 1;
      const index = actorIndex < 0
        ? (step % players.length)
        : (actorIndex + direction * order + players.length * 2) % players.length;
      const player = players[index];
      const isMe = String(player.id) === String(appState.myPlayerId || socket.id);
      const seatName = isMe ? null : getOpponentPositionName(player.id, players, appState.myPlayerId || socket.id);
      const node = isMe
        ? document.querySelector('.current-player-seat')
        : (seatName ? document.querySelector(`.seat-${seatName}`) : null);
      if (!node) return;
      setTimeout(() => {
        node.classList.remove('reverse-player-wave');
        void node.offsetWidth;
        node.classList.add('reverse-player-wave');
        setTimeout(() => node.classList.remove('reverse-player-wave'), 780);
      }, order * 150);
    });
  }

  function playReverseSynthSound() {
    if (document.getElementById('sound-status')?.textContent?.trim() === 'OFF') return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      const context = new AudioContextClass();
      const now = context.currentTime;
      const master = context.createGain();
      master.gain.setValueAtTime(.0001, now);
      master.gain.exponentialRampToValueAtTime(.16, now + .035);
      master.gain.exponentialRampToValueAtTime(.0001, now + 1.15);
      master.connect(context.destination);

      const warp = context.createOscillator();
      const warpGain = context.createGain();
      warp.type = 'sawtooth';
      warp.frequency.setValueAtTime(620, now);
      warp.frequency.exponentialRampToValueAtTime(72, now + .72);
      warpGain.gain.setValueAtTime(.42, now);
      warpGain.gain.exponentialRampToValueAtTime(.001, now + .76);
      warp.connect(warpGain).connect(master);
      warp.start(now);
      warp.stop(now + .78);

      const bass = context.createOscillator();
      const bassGain = context.createGain();
      bass.type = 'sine';
      bass.frequency.setValueAtTime(92, now + .2);
      bass.frequency.exponentialRampToValueAtTime(38, now + 1.05);
      bassGain.gain.setValueAtTime(.001, now);
      bassGain.gain.setValueAtTime(.7, now + .2);
      bassGain.gain.exponentialRampToValueAtTime(.001, now + 1.1);
      bass.connect(bassGain).connect(master);
      bass.start(now);
      bass.stop(now + 1.12);
      setTimeout(() => context.close().catch(() => {}), 1400);
    } catch (_) {
      // Audio may be unavailable until a browser gesture unlocks it.
    }
  }

  function startDiscardFlight(card, cardEl) {
    const discardPile = document.getElementById('discard-pile-3d');
    const hand = document.getElementById('player-cards-fan');
    if (!card || !cardEl || !discardPile || !hand) return;

    const source = cardEl.getBoundingClientRect();
    const destination = discardPile.getBoundingClientRect();
    const targetWidth = destination.width || source.width;
    const targetHeight = destination.height || source.height;
    const sourceCenterX = source.left + source.width / 2;
    const sourceCenterY = source.top + source.height / 2;
    const boardScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--board-scale')) || 1;
    const endCenterX = destination.left + destination.width / 2 - 3 * boardScale;
    const endCenterY = destination.top + destination.height / 2 - 3 * boardScale;
    const startX = sourceCenterX - targetWidth / 2;
    const startY = sourceCenterY - targetHeight / 2;
    const randomAngle = (Math.random() - 0.5) * 24;
    let overlay = document.getElementById('ghost-animation-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ghost-animation-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
      document.body.appendChild(overlay);
    }

    const ghost = create3DCardElement(card, 0, 0, false);
    ghost.classList.add('discard-flight-ghost');
    const isSkip = String(card.value).toLowerCase() === 'skip';
    const isReverse = String(card.value).toLowerCase() === 'reverse';
    const isDrawTwo = String(card.value).toLowerCase() === 'draw2';
    const isDrawFour = String(card.value).toLowerCase() === 'wild_draw4';
    const isWild = String(card.value).toLowerCase() === 'wild';
    if (isSkip) ghost.classList.add('power-card-glow');
    if (isReverse) ghost.classList.add('reverse-flight-ghost');
    if (isDrawTwo) ghost.classList.add('draw2-slam-ghost');
    if (isDrawFour) ghost.classList.add('draw4-slam-ghost');
    if (isWild) ghost.classList.add('wild-color-transition-ghost');
    ghost.classList.remove('selected', 'just-drawn');
    Object.assign(ghost.style, {
      position: 'absolute', left: `${startX}px`, top: `${startY}px`,
      width: `${targetWidth}px`, height: `${targetHeight}px`, zIndex: '9999',
      transform: `translate3d(0,0,0) scale(${source.width / targetWidth},${source.height / targetHeight}) rotate(0deg)`
    });
    overlay.appendChild(ghost);
    ghost.getBoundingClientRect();

    cardEl.remove();
    refanHandAfterDiscard(hand);

    const beforeState = appState.latestServerState;
    const pending = { card, el: ghost, state: null, landed: false, hand, rotation: randomAngle,
      chosenColor: window.pendingWildChosenColor || beforeState?.currentColor || 'red',
      skipTargetId: isSkip ? getSkippedPlayerId(beforeState) : null,
      drawTwoTargetId: isDrawTwo ? getSkippedPlayerId(beforeState) : null,
      drawFourTargetId: isDrawFour ? getSkippedPlayerId(beforeState) : null };
    window.pendingDiscardFlight = pending;
    const land = () => {
      if (window.pendingDiscardFlight !== pending || pending.landed) return;
      pending.landed = true;
      if (pending.state) finishDiscardFlight(pending);
    };
    if (isReverse) {
      pending.flight = animateReverseFlight(ghost, overlay, {
        startX, startY, width: targetWidth, height: targetHeight,
        dx: endCenterX - sourceCenterX, dy: endCenterY - sourceCenterY,
        startTransform: ghost.style.transform,
        endTransform: `translate3d(${endCenterX - sourceCenterX}px,${endCenterY - sourceCenterY}px,0) scale(1) rotate(${randomAngle}deg)`
      });
      pending.flight.animation.finished.then(land).catch(() => {});
    } else if (isDrawTwo) {
      const endTransform = `translate3d(${endCenterX - sourceCenterX}px,${endCenterY - sourceCenterY}px,0) scale(1) rotate(${randomAngle}deg)`;
      pending.flight = animateDrawTwoSlamFlight(ghost, overlay, {
        startX, startY, width: targetWidth, height: targetHeight,
        dx: endCenterX - sourceCenterX, dy: endCenterY - sourceCenterY,
        startTransform: ghost.style.transform, endTransform
      });
      pending.flight.animation.finished.then(land).catch(() => {});
    } else if (isDrawFour) {
      const endTransform = `translate3d(${endCenterX - sourceCenterX}px,${endCenterY - sourceCenterY}px,0) scale(1) rotate(${randomAngle}deg)`;
      pending.flight = animateDrawFourSlamFlight(ghost, overlay, {
        startX, startY, width: targetWidth, height: targetHeight,
        dx: endCenterX - sourceCenterX, dy: endCenterY - sourceCenterY,
        startTransform: ghost.style.transform, endTransform
      });
      pending.flight.animation.finished.then(land).catch(() => {});
    } else if (isWild) {
      const endTransform = `translate3d(${endCenterX - sourceCenterX}px,${endCenterY - sourceCenterY}px,0) scale(1) rotate(${randomAngle}deg)`;
      pending.flight = animateWildSlamFlight(ghost, overlay, {
        startX, startY, width: targetWidth, height: targetHeight,
        dx: endCenterX - sourceCenterX, dy: endCenterY - sourceCenterY,
        startTransform: ghost.style.transform, endTransform
      }, pending.chosenColor);
      pending.flight.animation.finished.then(land).catch(() => {});
    } else {
      requestAnimationFrame(() => {
        ghost.style.transform = `translate3d(${endCenterX - sourceCenterX}px,${endCenterY - sourceCenterY}px,0) scale(1) rotate(${randomAngle}deg)`;
      });
    }
    ghost.addEventListener('transitionend', land, { once: true });
    setTimeout(land, isReverse ? 720 : isDrawTwo ? 470 : isDrawFour ? 540 : isWild ? 1320 : 500);
    setTimeout(() => {
      if (window.pendingDiscardFlight === pending) cancelDiscardFlight();
    }, 5000);
  }

  function refanHandAfterDiscard(hand) {
    const cards = Array.from(hand.children).filter(el => el.classList?.contains('card-3d'));
    const total = cards.length;
    const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--board-scale')) || 1;
    const cardWidth = cards[0] ? cards[0].offsetWidth * scale : 64;
    const availableWidth = hand.clientWidth || 380;
    const spread = total > 1
      ? Math.min(380, total * 40, Math.max(0, availableWidth - cardWidth - 16))
      : 0;
    cards.forEach((cardEl, idx) => {
      const angle = total > 1 ? -20 + idx * (40 / (total - 1)) : 0;
      const x = total > 1 ? -spread / 2 + idx * (spread / (total - 1)) : 0;
      const y = Math.abs(angle) * 0.8;
      cardEl.style.setProperty('--x', x);
      cardEl.style.setProperty('--y', y);
      cardEl.style.setProperty('--angle', angle);
      cardEl.style.setProperty('--index', idx);
      cardEl.style.transform = `translateX(${x}px) translateY(${y}px) rotateZ(${angle}deg) scale(1)`;
    });
  }

  function finishDiscardFlight(pending) {
    if (!pending || window.pendingDiscardFlight !== pending || !pending.state) return;
    pending.el.remove();
    pending.flight?.animation.cancel();
    pending.flight?.trail.remove();
    window.pendingDiscardFlight = null;
    renderGame(pending.state, pending.rotation);
    if (pending.skipTargetId != null) playSkipImpact(pending.skipTargetId, pending.state);
    if (String(pending.card.value).toLowerCase() === 'reverse') playReverseImpact(pending.state);
    if (pending.drawTwoTargetId != null) {
      const incoming = hideDrawTwoTargetCards(pending.drawTwoTargetId, pending.state);
      playDrawTwoImpact(pending.drawTwoTargetId, pending.state, incoming);
    }
    if (pending.drawFourTargetId != null) {
      const incoming = hideDrawTwoTargetCards(pending.drawFourTargetId, pending.state, 4);
      playDrawTwoImpact(pending.drawFourTargetId, pending.state, incoming);
    }
    if (String(pending.card.value).toLowerCase() === 'wild') {
      playWildColorChange(pending.state.currentColor, pending.state);
    }
  }

  function getSkippedPlayerId(state) {
    if (!state?.players?.length) return null;
    const players = state.players;
    const currentId = state.currentTurnPlayerId ?? appState.myPlayerId ?? socket.id;
    const currentIndex = players.findIndex(player => String(player.id) === String(currentId));
    if (currentIndex < 0) return null;
    const direction = Number(state.direction) === -1 ? -1 : 1;
    return players[(currentIndex + direction + players.length) % players.length]?.id ?? null;
  }

  function playSkipImpact(playerId, state) {
    const myId = appState.myPlayerId || socket.id;
    const isMe = String(playerId) === String(myId);
    const seatName = isMe ? null : getOpponentPositionName(playerId, state.players, myId);
    const seat = isMe
      ? document.querySelector('.current-player-seat')
      : (seatName ? document.querySelector(`.seat-${seatName}`) : null);
    const pile = document.getElementById('discard-pile-3d');
    const overlay = document.getElementById('ghost-animation-overlay');
    if (!seat || !pile || !overlay) return;

    const pileRect = pile.getBoundingClientRect();
    const seatRect = seat.getBoundingClientRect();
    const shock = document.createElement('div');
    shock.className = 'skip-impact-shockwave';
    shock.style.left = `${pileRect.left + pileRect.width / 2}px`;
    shock.style.top = `${pileRect.top + pileRect.height / 2}px`;
    overlay.appendChild(shock);

    const stamp = document.createElement('div');
    stamp.className = 'skip-hologram-stamp';
    stamp.innerHTML = '<span class="skip-shield-symbol">⊘</span><strong>SKIPPED!</strong>';
    stamp.style.left = `${seatRect.left + seatRect.width / 2}px`;
    stamp.style.top = `${seatRect.top + seatRect.height / 2}px`;
    overlay.appendChild(stamp);

    seat.classList.add('skip-target-hit');
    const table = document.querySelector('.table-3d-plate');
    table?.classList.add('skip-table-rumble');
    setTimeout(() => shock.remove(), 850);
    setTimeout(() => stamp.remove(), 1550);
    setTimeout(() => seat.classList.remove('skip-target-hit'), 1450);
    setTimeout(() => table?.classList.remove('skip-table-rumble'), 500);
  }

  function hideDrawTwoTargetCards(playerId, state, drawCount = 2) {
    const player = state.players?.find(item => String(item.id) === String(playerId));
    if (!player) return null;
    const isMe = String(playerId) === String(appState.myPlayerId || socket.id);
    const seatName = isMe ? null : getOpponentPositionName(playerId, state.players, appState.myPlayerId || socket.id);
    const container = isMe
      ? document.getElementById('player-cards-fan')
      : (seatName ? document.getElementById(`opp-${seatName}-cards`) : null);
    if (!container) return null;
    const cards = Array.from(container.querySelectorAll('.card-3d'));
    const startIndex = Math.max(0, Number(player.cardCount || 0) - drawCount);
    const incomingCards = cards.slice(startIndex, startIndex + drawCount);
    incomingCards.forEach(card => { card.style.visibility = 'hidden'; });
    const countEl = isMe ? null : document.getElementById(`opp-${seatName}-count`);
    const currentCount = countEl ? Number(countEl.textContent) : null;
    if (countEl && Number.isFinite(currentCount)) countEl.textContent = String(Math.max(0, Number(player.cardCount) - drawCount));
    const incoming = {
      cards: incomingCards,
      countEl,
      finalCount: Number(player.cardCount || 0),
      oldCount: Number.isFinite(currentCount) ? String(currentCount) : null,
      drawCount,
      restored: false
    };
    window.pendingDrawTwoVisual = incoming;
    return incoming;
  }

  function maintainDrawTwoTargetVisual() {
    const incoming = window.pendingDrawTwoVisual;
    if (!incoming || incoming.restored) return;
    incoming.cards.forEach(card => {
      if (card.isConnected) card.style.visibility = 'hidden';
    });
    if (incoming.countEl && incoming.oldCount != null) incoming.countEl.textContent = incoming.oldCount;
  }

  function restoreDrawTwoTargetCards(incoming) {
    if (!incoming || incoming.restored) return;
    incoming.restored = true;
    incoming.cards.forEach(card => {
      if (card.isConnected) card.style.visibility = '';
    });
    if (incoming.countEl) incoming.countEl.textContent = String(incoming.finalCount);
    if (window.pendingDrawTwoVisual === incoming) window.pendingDrawTwoVisual = null;
  }

  function playDrawTwoImpact(playerId, state, incomingCards = null) {
    const overlay = document.getElementById('ghost-animation-overlay');
    const deck = document.getElementById('draw-deck-3d');
    const pile = document.getElementById('discard-pile-3d');
    if (playerId == null) return;
    const incoming = incomingCards || hideDrawTwoTargetCards(playerId, state);
    const drawCount = incoming?.drawCount || 2;
    const isDrawFour = drawCount === 4;
    if (!overlay || !deck || !pile) {
      restoreDrawTwoTargetCards(incoming);
      return;
    }

    const isMe = String(playerId) === String(appState.myPlayerId || socket.id);
    const targetSeatName = isMe ? null : getOpponentPositionName(playerId, state.players || [], appState.myPlayerId || socket.id);
    const targetNode = isMe
      ? document.getElementById('player-cards-fan')
      : (targetSeatName ? document.querySelector(`.seat-${targetSeatName}`) : null);
    if (!targetNode) {
      restoreDrawTwoTargetCards(incoming);
      return;
    }

    const deckRect = deck.getBoundingClientRect();
    const pileRect = pile.getBoundingClientRect();
    const targetRect = targetNode.getBoundingClientRect();
    const deckX = deckRect.left + deckRect.width / 2;
    const deckY = deckRect.top + deckRect.height / 2;
    const pileX = pileRect.left + pileRect.width / 2;
    const pileY = pileRect.top + pileRect.height / 2;
    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;

    const pileBurst = document.createElement('div');
    pileBurst.className = isDrawFour ? 'draw4-impact-core' : 'draw2-impact-core';
    pileBurst.style.left = `${pileX}px`;
    pileBurst.style.top = `${pileY}px`;
    overlay.appendChild(pileBurst);
    setTimeout(() => pileBurst.remove(), 700);
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement('div');
      ring.className = isDrawFour ? 'draw4-impact-ring' : 'draw2-impact-ring';
      ring.style.left = `${pileX}px`;
      ring.style.top = `${pileY}px`;
      ring.style.setProperty('--draw2-delay', `${i * 90}ms`);
      overlay.appendChild(ring);
      setTimeout(() => ring.remove(), 1000);
    }

    const deckJumpClass = isDrawFour ? 'draw4-deck-jump' : 'draw2-deck-jump';
    deck.classList.remove('draw2-deck-jump', 'draw4-deck-jump');
    void deck.offsetWidth;
    deck.classList.add(deckJumpClass);
    setTimeout(() => deck.classList.remove(deckJumpClass), isDrawFour ? 900 : 720);

    const targetImpactClass = isDrawFour ? 'draw4-player-impact' : 'draw2-player-impact';
    targetNode.classList.remove('draw2-player-impact', 'draw4-player-impact');
    void targetNode.offsetWidth;
    targetNode.classList.add(targetImpactClass);
    setTimeout(() => targetNode.classList.remove(targetImpactClass), isDrawFour ? 1450 : 1100);

    let missileHits = 0;
    const showTargetImpact = () => {
      missileHits++;
      const burst = document.createElement('div');
      burst.className = isDrawFour ? 'draw4-target-burst' : 'draw2-target-burst';
      burst.style.left = `${targetX}px`;
      burst.style.top = `${targetY}px`;
      overlay.appendChild(burst);
      setTimeout(() => burst.remove(), 850);
      for (let i = 0; i < 2; i++) {
        const ring = document.createElement('div');
        ring.className = isDrawFour ? 'draw4-target-ring' : 'draw2-target-ring';
        ring.style.left = `${targetX}px`;
        ring.style.top = `${targetY}px`;
        ring.style.setProperty('--draw2-delay', `${i * 70}ms`);
        overlay.appendChild(ring);
        setTimeout(() => ring.remove(), 780);
      }
      if (missileHits === 1) {
        const text = document.createElement('div');
        text.className = isDrawFour ? 'draw4-cards-label' : 'draw2-cards-label';
        text.textContent = `+${drawCount} CARDS!`;
        text.style.left = `${targetX}px`;
        text.style.top = `${targetY - 34}px`;
        overlay.appendChild(text);
        setTimeout(() => text.remove(), 1250);
      }
      if (missileHits >= drawCount) restoreDrawTwoTargetCards(incoming);
    };

    const cardWidth = isDrawFour ? 44 : 52;
    const cardHeight = isDrawFour ? 70 : 82;
    const offsets = isDrawFour ? [-1.5, -.5, .5, 1.5] : [-1, 1];
    offsets.forEach((side, index) => {
      const x = deckX + side * (isDrawFour ? 10 : 12);
      const y = deckY;
      const hoverX = x + side * (isDrawFour ? 24 : 20);
      const hoverY = y - (isDrawFour ? 70 : 78) - (index % 2) * (isDrawFour ? 24 : 12);
      const card = document.createElement('div');
      const glyph = isDrawFour ? '+1' : '+2';
      card.className = isDrawFour ? 'draw4-spectral-card' : 'draw2-spectral-card';
      card.innerHTML = `<span class="draw2-spectral-corner">${glyph}</span><b>${glyph}</b><span class="draw2-spectral-corner draw2-spectral-corner-bottom">${glyph}</span>`;
      Object.assign(card.style, {
        left: `${x - cardWidth / 2}px`, top: `${y - cardHeight / 2}px`,
        width: `${cardWidth}px`, height: `${cardHeight}px`,
        transform: 'translate3d(0,0,0) scale(.12) rotate(0deg)'
      });
      overlay.appendChild(card);

      const hoverTransform = `translate3d(${hoverX - x}px,${hoverY - y}px,0) scale(1) rotate(${side * (isDrawFour ? 9 : 12)}deg)`;
      const pop = card.animate([
        { transform: 'translate3d(0,0,0) scale(.12) rotate(0deg)', opacity: 0 },
        { transform: hoverTransform, opacity: 1, offset: 1 }
      ], { duration: 270, easing: 'cubic-bezier(.16,1.2,.3,1)', fill: 'forwards' });
      pop.finished.then(() => {
        card.style.transform = hoverTransform;
        pop.cancel();
        card.classList.add('draw2-spectral-hover');
        setTimeout(() => {
          card.classList.remove('draw2-spectral-hover');
          const dx = targetX + side * 18 - hoverX;
          const dy = targetY - hoverY;
          const angle = Math.atan2(dy, dx) * 180 / Math.PI;
          const distance = Math.hypot(dx, dy);
          const trail = document.createElement('div');
          trail.className = isDrawFour ? 'draw4-plasma-trail' : 'draw2-plasma-trail';
          Object.assign(trail.style, {
            left: `${hoverX}px`, top: `${hoverY}px`, width: `${distance}px`,
            transform: `rotate(${angle}deg) scaleX(0)`
          });
          overlay.appendChild(trail);
          trail.animate([
            { transform: `rotate(${angle}deg) scaleX(0)`, opacity: .95, offset: 0 },
            { transform: `rotate(${angle}deg) scaleX(1)`, opacity: .8, offset: .35 },
            { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 0, offset: 1 }
          ], { duration: 480, easing: 'ease-out', fill: 'forwards' });
          const hit = card.animate([
            { transform: hoverTransform, opacity: 1 },
            { transform: `translate3d(${targetX + side * 18 - x}px,${targetY - y}px,0) scale(.16) rotate(${angle}deg)`, opacity: .15 }
          ], { duration: 480, easing: 'cubic-bezier(.55,0,.95,.3)', fill: 'forwards' });
          hit.finished.then(() => {
            card.remove();
            trail.remove();
            showTargetImpact();
          }).catch(() => {});
        }, (isDrawFour ? 220 : 330) + index * (isDrawFour ? 45 : 70));
      }).catch(() => {});
      setTimeout(() => card.remove(), isDrawFour ? 2400 : 2600);
    });
    setTimeout(() => restoreDrawTwoTargetCards(incoming), isDrawFour ? 2600 : 2400);
  }

  function captureRemoteDiscardSource(previousState, nextState) {
    const played = nextState?.lastPlayedCard;
    if (!previousState?.topCard || !nextState?.topCard || !played
      || String(previousState.topCard.id) === String(nextState.topCard.id)
      || String(played.cardId) !== String(nextState.topCard.id)
      || String(played.playerId) === String(appState.myPlayerId || socket.id)) return null;

    const seatName = getOpponentPositionName(played.playerId, previousState.players || [], appState.myPlayerId || socket.id);
    const stack = seatName ? document.getElementById(`opp-${seatName}-cards`) : null;
    const cards = stack ? Array.from(stack.querySelectorAll('.card-3d')) : [];
    const sourceCard = Number.isInteger(Number(played.handIndex)) ? cards[Number(played.handIndex)] : null;
    if (!sourceCard) return null;

    // Measure before renderGame re-fans the opponent's now smaller hand.
    const rect = sourceCard.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function captureRemoteDrawEvent(previousState, nextState) {
    const draw = nextState?.lastDrawEvent;
    if (!draw || draw.eventId == null
      || String(previousState?.lastDrawEvent?.eventId ?? '') === String(draw.eventId)
      || String(draw.playerId) === String(appState.myPlayerId || socket.id)) return null;

    const deck = document.getElementById('draw-deck-3d');
    if (!deck) return null;
    const rect = deck.getBoundingClientRect();
    return {
      ...draw,
      source: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    };
  }

  function animateRemoteDraw(draw, state) {
    if (!draw || window.pendingDrawGhost || window.pendingDiscardFlight) return;
    const me = appState.myPlayerId || socket.id;
    const seatName = getOpponentPositionName(draw.playerId, state.players || [], me);
    const stack = seatName ? document.getElementById(`opp-${seatName}-cards`) : null;
    const targetCard = stack?.querySelectorAll('.card-3d')[Number(draw.handIndex)];
    if (!stack || !targetCard) return;
    let overlay = document.getElementById('ghost-animation-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ghost-animation-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
      document.body.appendChild(overlay);
    }

    const target = targetCard.getBoundingClientRect();
    const source = draw.source;
    const cardWidth = targetCard.offsetWidth || 84;
    const cardHeight = targetCard.offsetHeight || cardWidth * 1.58;
    const targetIndex = Number(draw.handIndex);
    const count = stack.querySelectorAll('.card-3d').length;
    const localAngle = count > 1 ? -17.5 + targetIndex * (35 / (count - 1)) : 0;
    const seatAngle = seatName === 'top' ? 180 : seatName === 'left' ? 90 : -90;
    const finalAngle = localAngle + seatAngle;
    const radians = finalAngle * Math.PI / 180;
    const expectedWidth = Math.abs(Math.cos(radians)) * cardWidth + Math.abs(Math.sin(radians)) * cardHeight;
    const expectedHeight = Math.abs(Math.sin(radians)) * cardWidth + Math.abs(Math.cos(radians)) * cardHeight;
    const finalScale = (target.width / expectedWidth + target.height / expectedHeight) / 2;
    const startCenterX = source.left + source.width / 2;
    const startCenterY = source.top + source.height / 2;
    const endCenterX = target.left + target.width / 2;
    const endCenterY = target.top + target.height / 2;

    const ghost = document.createElement('div');
    ghost.className = 'draw-flight-card remote-draw-flight-card';
    const back = create3DCardElement(null, targetIndex, 0, true);
    back.classList.add('draw-flight-face', 'draw-flight-back');
    ghost.appendChild(back);
    Object.assign(ghost.style, {
      left: `${startCenterX - cardWidth / 2}px`,
      top: `${startCenterY - cardHeight / 2}px`,
      width: `${cardWidth}px`,
      height: `${cardHeight}px`,
      transform: `translate3d(0,0,0) scale(${source.width / cardWidth},${source.height / cardHeight}) rotate(0deg)`
    });
    targetCard.style.visibility = 'hidden';
    overlay.appendChild(ghost);
    ghost.getBoundingClientRect();
    requestAnimationFrame(() => {
      ghost.style.transform = `translate3d(${endCenterX - startCenterX}px,${endCenterY - startCenterY}px,0) rotate(${finalAngle}deg) scale(${finalScale})`;
    });

    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      ghost.remove();
      if (targetCard.isConnected) targetCard.style.visibility = '';
    };
    ghost.addEventListener('transitionend', land, { once: true });
    setTimeout(land, 520);
  }

  function animateRemoteDiscard(previousState, nextState, measuredSource) {
    // Local plays already have a measured hand-card ghost. Remote plays are
    // detected from the authoritative top-card change and use the opponent's
    // visible seat as their flight origin.
    if (window.pendingDiscardFlight || !previousState?.topCard || !nextState?.topCard
      || String(previousState.topCard.id) === String(nextState.topCard.id)) return;

    const played = nextState.lastPlayedCard;
    const actorId = played?.playerId || previousState.currentTurnPlayerId;
    const isSkip = String(nextState.topCard.value).toLowerCase() === 'skip';
    const isReverse = String(nextState.topCard.value).toLowerCase() === 'reverse';
    const isDrawTwo = String(nextState.topCard.value).toLowerCase() === 'draw2';
    const isDrawFour = String(nextState.topCard.value).toLowerCase() === 'wild_draw4';
    const isWild = String(nextState.topCard.value).toLowerCase() === 'wild';
    const targetId = isSkip ? getSkippedPlayerId(previousState) : null;
    const drawTwoTargetId = isDrawTwo ? getSkippedPlayerId(previousState) : null;
    const drawFourTargetId = isDrawFour ? getSkippedPlayerId(previousState) : null;
    const signature = `${actorId}:${nextState.topCard.id}`;
    if (((isSkip && targetId == null) || (isDrawTwo && drawTwoTargetId == null)
      || (isDrawFour && drawFourTargetId == null))
      || signature === window.lastRemoteDiscardAnimationKey) return;
    window.lastRemoteDiscardAnimationKey = signature;
    const incomingDrawTwoCards = isDrawTwo ? hideDrawTwoTargetCards(drawTwoTargetId, nextState) : null;
    const incomingDrawFourCards = isDrawFour ? hideDrawTwoTargetCards(drawFourTargetId, nextState, 4) : null;

    const actorSeat = getOpponentPositionName(actorId, previousState.players || [], appState.myPlayerId || socket.id);
    const sourceEl = actorSeat ? document.getElementById(`opp-${actorSeat}-cards`) : null;
    const pile = document.getElementById('discard-pile-3d');
    if (!sourceEl || !pile) {
      if (isSkip) playSkipImpact(targetId, nextState);
      if (isReverse) playReverseImpact(nextState);
      if (isDrawTwo) playDrawTwoImpact(drawTwoTargetId, nextState, incomingDrawTwoCards);
      if (isDrawFour) playDrawTwoImpact(drawFourTargetId, nextState, incomingDrawFourCards);
      if (isWild) playWildColorChange(nextState.currentColor, nextState);
      return;
    }

    let overlay = document.getElementById('ghost-animation-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ghost-animation-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
      document.body.appendChild(overlay);
    }

    const source = measuredSource || sourceEl.getBoundingClientRect();
    const pileRect = pile.getBoundingClientRect();
    const pileCard = pile.querySelector('.card-3d:last-child');
    const cardRect = pileCard?.getBoundingClientRect();
    const width = cardRect?.width || 84;
    const height = cardRect?.height || width * 1.58;
    const startCenterX = source.left + source.width / 2;
    const startCenterY = source.top + source.height / 2;
    const endCenterX = pileRect.left + pileRect.width / 2;
    const endCenterY = pileRect.top + pileRect.height / 2;
    const ghost = create3DCardElement(nextState.topCard, 0, 0, false);
    ghost.classList.add('discard-flight-ghost');
    if (isSkip) ghost.classList.add('power-card-glow');
    if (isReverse) ghost.classList.add('reverse-flight-ghost');
    if (isDrawTwo) ghost.classList.add('draw2-slam-ghost');
    if (isDrawFour) ghost.classList.add('draw4-slam-ghost');
    if (isWild) ghost.classList.add('wild-color-transition-ghost');
    Object.assign(ghost.style, {
      position: 'absolute', left: `${startCenterX - width / 2}px`, top: `${startCenterY - height / 2}px`,
      width: `${width}px`, height: `${height}px`, zIndex: '10000',
      transform: `translate3d(0,0,0) scale(${source.width / width},${source.height / height}) rotate(-8deg)`
    });
    overlay.appendChild(ghost);
    if (pileCard) pileCard.style.visibility = 'hidden';
    ghost.getBoundingClientRect();
    let landed = false;
    let reverseFlight = null;
    let wildFlight = null;
    const land = () => {
      if (landed) return;
      landed = true;
      ghost.remove();
      reverseFlight?.trail.remove();
      wildFlight?.trail.remove();
      if (pileCard?.isConnected) pileCard.style.visibility = '';
      if (isSkip) playSkipImpact(targetId, nextState);
      if (isReverse) playReverseImpact(nextState);
      if (isDrawTwo) playDrawTwoImpact(drawTwoTargetId, nextState, incomingDrawTwoCards);
      if (isDrawFour) playDrawTwoImpact(drawFourTargetId, nextState, incomingDrawFourCards);
      if (isWild) playWildColorChange(nextState.currentColor, nextState);
    };
    const endTransform = `translate3d(${endCenterX - startCenterX}px,${endCenterY - startCenterY}px,0) scale(1) rotate(0deg)`;
    if (isReverse) {
      reverseFlight = animateReverseFlight(ghost, overlay, {
        startX: startCenterX - width / 2, startY: startCenterY - height / 2,
        width, height, dx: endCenterX - startCenterX, dy: endCenterY - startCenterY,
        startTransform: ghost.style.transform, endTransform
      });
      reverseFlight.animation.finished.then(land).catch(() => {});
      setTimeout(land, 720);
    } else if (isDrawTwo) {
      const flight = animateDrawTwoSlamFlight(ghost, overlay, {
        startX: startCenterX - width / 2, startY: startCenterY - height / 2,
        width, height, dx: endCenterX - startCenterX, dy: endCenterY - startCenterY,
        startTransform: ghost.style.transform, endTransform
      });
      flight.animation.finished.then(land).catch(() => {});
      setTimeout(land, 470);
    } else if (isDrawFour) {
      const flight = animateDrawFourSlamFlight(ghost, overlay, {
        startX: startCenterX - width / 2, startY: startCenterY - height / 2,
        width, height, dx: endCenterX - startCenterX, dy: endCenterY - startCenterY,
        startTransform: ghost.style.transform, endTransform
      });
      flight.animation.finished.then(land).catch(() => {});
      setTimeout(land, 540);
    } else if (isWild) {
      wildFlight = animateWildSlamFlight(ghost, overlay, {
        startX: startCenterX - width / 2, startY: startCenterY - height / 2,
        width, height, dx: endCenterX - startCenterX, dy: endCenterY - startCenterY,
        startTransform: ghost.style.transform, endTransform
      }, String(nextState.currentColor || 'red').toLowerCase());
      wildFlight.animation.finished.then(land).catch(() => {});
      setTimeout(land, 1320);
    } else {
      requestAnimationFrame(() => { ghost.style.transform = endTransform; });
      ghost.addEventListener('transitionend', land, { once: true });
      setTimeout(land, 520);
    }
  }

  function cancelDiscardFlight() {
    const pending = window.pendingDiscardFlight;
    if (!pending) return;
    pending.el.remove();
    pending.flight?.animation.cancel();
    pending.flight?.trail.remove();
    window.pendingDiscardFlight = null;
    if (pending.hand) pending.hand.dataset.handSignature = '';
    if (appState.latestServerState) renderGame(appState.latestServerState);
  }

  /**
   * Two-Tap Card Selection and Play Controller
   */
  function handleCardClick(card, cardEl, idx) {
    if (!appState.roomId) {
      showToast('No active match found.');
      return;
    }

    if (!appState.isMyTurn || appState.pendingAction || window.pendingDiscardFlight) {
      showToast('Wait for your turn to play!');
      return;
    }

    // Tap 2: Play the selected card
    if (appState.selectedCardId && String(appState.selectedCardId) === String(card.id)) {
      appState.selectedCardId = null;

      if (card.color === 'wild' || card.value === 'wild' || card.value === 'wild_draw4') {
        appState.pendingWildCardId = card.id;
        appState.pendingWildCardIndex = idx;
        const colorModal = document.getElementById('color-picker-modal');
        if (colorModal) {
          const discardHub = document.getElementById('discard-pile-3d');
          const wheelAnchor = colorModal.querySelector('.color-picker-box');
          const hubRect = discardHub?.getBoundingClientRect();
          if (wheelAnchor && hubRect) {
            wheelAnchor.style.left = `${hubRect.left + hubRect.width / 2}px`;
            wheelAnchor.style.top = `${hubRect.top + hubRect.height / 2}px`;
          }
          colorModal.classList.remove('hidden');
        }
      } else {
        appState.pendingAction = 'play';
        startDiscardFlight(card, cardEl);
        socket.emit('play_card', {
          roomId: appState.roomId,
          cardId: card.id,
          cardIndex: idx
        });

        // Defensive timeout reset in case of packet loss
        setTimeout(() => {
          if (appState.pendingAction === 'play') appState.pendingAction = null;
        }, 3000);
      }
    } else {
      // Tap 1: Select and raise the card in hand
      appState.selectedCardId = card.id;
      document.querySelectorAll('.player-cards-fan-layout .card-3d').forEach(el => {
        el.classList.remove('selected');
      });
      if (cardEl) {
        cardEl.classList.add('selected');
      }
    }
  }

  // ==========================================================================
  // DOM EVENT BINDINGS
  // ==========================================================================

  function setupMatchWager() {
    const modal = document.getElementById('match-setup-modal');
    const amountInput = document.getElementById('match-wager-amount');
    const wagerField = document.getElementById('match-wager-field');
    const playerSelect = document.getElementById('match-player-count');
    const payoutPreview = document.getElementById('match-payout-preview');
    const walletPreview = document.getElementById('match-wallet-preview');
    const continueButton = document.getElementById('btn-match-setup-confirm');
    if (!modal || !amountInput || !playerSelect || !continueButton) return;
    const setupTitle = document.getElementById('match-setup-title');

    const updatePreview = () => {
      wagerField?.classList.toggle('hidden', appState.isAdmin);
      if (setupTitle) setupTitle.innerHTML = appState.isAdmin
        ? '<i class="fa-solid fa-shield-halved"></i> Admin Match Setup'
        : '<i class="fa-solid fa-coins"></i> Set Match Wager';
      const stake = Number(amountInput.value);
      const players = Number(playerSelect.value);
      const coins = window.UnoEconomy?.getProfile().coins ?? 0;
      const validStake = appState.isAdmin || (Number.isInteger(stake) && stake >= 50 && stake <= 10000);
      const pot = validStake && !appState.isAdmin ? stake * players : 0;
      if (payoutPreview) payoutPreview.textContent = appState.isAdmin
        ? 'Admin test match: no coins are required or awarded.'
        : validStake
        ? `Winner gets the ${pot.toLocaleString()} coin pot (${stake} × ${players} players).`
        : 'Choose a stake from 50 to 10,000 coins.';
      if (walletPreview) {
        walletPreview.textContent = appState.isAdmin
          ? 'Admin mode is active. Match wagers and shop costs are disabled.'
          : !appState.walletReady
          ? 'Connecting to your saved wallet…'
          : validStake && coins >= stake
          ? `Your balance: ${coins.toLocaleString()} coins · Stake: ${stake.toLocaleString()} coins`
          : `Your balance: ${coins.toLocaleString()} coins · Not enough coins for this stake.`;
        walletPreview.classList.toggle('insufficient', !appState.isAdmin && appState.walletReady && (!validStake || coins < stake));
      }
      continueButton.disabled = !appState.walletReady || (!appState.isAdmin && (!validStake || coins < stake));
    };

    const close = () => {
      modal.classList.add('hidden');
      appState.pendingGameMode = null;
    };
    document.getElementById('btn-match-setup-close')?.addEventListener('click', close);
    document.getElementById('btn-match-setup-cancel')?.addEventListener('click', close);
    amountInput.addEventListener('input', updatePreview);
    playerSelect.addEventListener('change', updatePreview);
    window.addEventListener('uno-wallet-balance-changed', updatePreview);
    window.addEventListener('uno-admin-mode-changed', updatePreview);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });

    document.getElementById('btn-vs-ai')?.addEventListener('click', () => {
      appState.pendingGameMode = 'ai';
      updatePreview();
      modal.classList.remove('hidden');
    });
    document.getElementById('btn-create-room')?.addEventListener('click', () => {
      appState.pendingGameMode = 'lan';
      updatePreview();
      modal.classList.remove('hidden');
    });
    continueButton.addEventListener('click', () => {
      const requestedStake = Number(amountInput.value);
      const stake = appState.isAdmin ? 0 : requestedStake;
      const targetPlayers = Number(playerSelect.value);
      const mode = appState.pendingGameMode;
      if (!mode || (!appState.isAdmin && (!Number.isInteger(stake) || stake < 50 || stake > 10000
        || !appState.walletReady || window.UnoEconomy.getProfile().coins < stake))
        || ![2, 3, 4].includes(targetPlayers) || !appState.walletReady) {
        updatePreview();
        return;
      }
      appState.stake = stake;
      appState.targetPlayers = targetPlayers;
      close();
      requestFullscreenApp();
      const nameInput = document.getElementById('player-name');
      const name = nameInput?.value.trim() || 'Player 1';
      appState.playerName = name;
      socket.emit('create_room', { playerName: name, mode, stake, targetPlayers, walletId: appState.walletId });
    });
    updatePreview();
  }

  function setupStartupScreen() {
    const startupScreen = document.getElementById('startup-screen');
    const startButton = document.getElementById('startup-start');
    const status = document.getElementById('startup-status');
    if (!startupScreen || !startButton) return;

    const loadingStartedAt = performance.now();
    const pageReady = document.readyState === 'complete'
      ? Promise.resolve()
      : new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
    const fontsReady = document.fonts?.ready || Promise.resolve();
    Promise.all([pageReady, fontsReady]).then(() => {
      const minimumLoadingTime = 650;
      const delay = Math.max(0, minimumLoadingTime - (performance.now() - loadingStartedAt));
      setTimeout(() => {
        if (status) status.textContent = 'Ready to play';
        startupScreen.classList.add('is-ready');
        startButton.disabled = false;
      }, delay);
    }).catch(() => {
      if (status) status.textContent = 'Ready to play';
      startupScreen.classList.add('is-ready');
      startButton.disabled = false;
    });

    startButton.addEventListener('click', () => {
      if (startButton.disabled) return;
      requestFullscreenApp();
      showScreen('menu-screen');
      startupScreen.classList.add('leaving');
      setTimeout(() => startupScreen.classList.add('hidden'), 380);
    });
  }

  function setupCyberpunkCardTilt() {
    const selectors = '.cyberpunk-card-face, .cyberpunk-deck-back';
    document.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      const card = event.target.closest?.(selectors);
      if (!card) return;
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      card.style.setProperty('--cyber-tilt-x', `${(0.5 - y) * 36}deg`);
      card.style.setProperty('--cyber-tilt-y', `${(x - 0.5) * 36}deg`);
      card.style.setProperty('--cyber-holo-x', `${x * 100}%`);
      card.style.setProperty('--cyber-holo-y', `${y * 100}%`);
    });
    document.addEventListener('pointerout', event => {
      const card = event.target.closest?.(selectors);
      if (!card || card.contains(event.relatedTarget)) return;
      card.style.setProperty('--cyber-tilt-x', '0deg');
      card.style.setProperty('--cyber-tilt-y', '0deg');
      card.style.setProperty('--cyber-holo-x', '50%');
      card.style.setProperty('--cyber-holo-y', '50%');
    });
    document.addEventListener('click', event => {
      const card = event.target.closest?.(selectors);
      if (!card) return;
      card.classList.remove('cyberpunk-glitch-burst');
      void card.offsetWidth;
      card.classList.add('cyberpunk-glitch-burst');
    });
    document.addEventListener('animationend', event => {
      if (event.animationName === 'cyber-glitch-burst') event.target.classList.remove('cyberpunk-glitch-burst');
    });
  }

  function bindDomEvents() {
    setupStartupScreen();
    setupMatchWager();
    setupThemeShop();
    setupCyberpunkCardTilt();
    const nameInput = document.getElementById('player-name');
    const btnShowJoin = document.getElementById('btn-show-join');
    const joinBox = document.getElementById('join-box');
    const btnJoinRoom = document.getElementById('btn-join-room');
    const roomCodeInput = document.getElementById('room-code-input');
    const btnStartGame = document.getElementById('btn-start-game');
    const btnLeaveLobby = document.getElementById('btn-leave-lobby');
    const drawDeck3d = document.getElementById('draw-deck-3d');
    const btnPassTurn = document.getElementById('btn-pass-turn');
    const btnUno = document.getElementById('btn-uno');
    const btnRestart = document.getElementById('btn-restart');
    const btnHome = document.getElementById('btn-home');

    // Toggle Join Code Input Box
    if (btnShowJoin && joinBox) {
      btnShowJoin.addEventListener('click', () => {
        joinBox.classList.toggle('hidden');
      });
    }

    // Join LAN Lobby
    if (btnJoinRoom) {
      btnJoinRoom.addEventListener('click', () => {
        requestFullscreenApp();
        const name = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : 'Player 1';
        const roomCode = (roomCodeInput && roomCodeInput.value.trim()) ? roomCodeInput.value.trim() : '';

        if (!roomCode) {
          showGameAlert('Please enter the 6-character room code!', 'ROOM CODE REQUIRED');
          return;
        }

        appState.playerName = name;
        socket.emit('join_room', { roomId: roomCode, playerName: name, walletId: appState.walletId });
      });
    }

    // Start Game
    if (btnStartGame) {
      btnStartGame.addEventListener('click', () => {
        requestFullscreenApp();
        if (appState.roomId) {
          socket.emit('start_game', { roomId: appState.roomId });
        }
      });
    }

    // Leave Lobby
    if (btnLeaveLobby) {
      btnLeaveLobby.addEventListener('click', () => {
        window.location.reload();
      });
    }

    // Draw Deck Click
    if (drawDeck3d) {
      drawDeck3d.addEventListener('click', () => {
        if (appState.roomId && appState.canDraw && !appState.pendingAction && !window.pendingDrawGhost) {
          // A previously selected card stays raised; clear it so it cannot be
          // mistaken for the card arriving from the draw pile.
          appState.selectedCardId = null;
          appState.pendingWildCardId = null;
          appState.pendingWildCardIndex = null;
          const hand = document.getElementById('player-cards-fan');
          if (hand) {
            hand.classList.add('draw-layout-sync');
            hand.querySelectorAll('.card-3d.selected').forEach(card => card.classList.remove('selected'));
            requestAnimationFrame(() => hand.classList.remove('draw-layout-sync'));
          }
          appState.pendingAction = 'draw';
          startDrawGhost(drawDeck3d, () => socket.emit('draw_card', { roomId: appState.roomId }));

          setTimeout(() => {
            if (appState.pendingAction === 'draw') appState.pendingAction = null;
          }, 3000);
        }
      });
    }

    // Pass Turn Click
    if (btnPassTurn) {
      btnPassTurn.addEventListener('click', () => {
        if (appState.roomId && appState.canPass && !appState.pendingAction) {
          appState.selectedCardId = null;
          appState.pendingAction = 'pass';
          socket.emit('pass_turn', { roomId: appState.roomId });

          setTimeout(() => {
            if (appState.pendingAction === 'pass') appState.pendingAction = null;
          }, 3000);
        }
      });
    }

    // UNO Button Click
    if (btnUno) {
      btnUno.addEventListener('click', () => {
        if (appState.roomId) {
          showToast('📣 Called UNO!');
          socket.emit('call_uno', { roomId: appState.roomId });
        }
      });
    }

    // Drawer and Menu Navigation
    const btnMenuTrigger = document.getElementById('btn-menu-trigger');
    const gameMenuDrawer = document.getElementById('game-menu-drawer');
    const btnDrawerClose = document.getElementById('btn-drawer-close');
    const btnDrawerResume = document.getElementById('btn-drawer-resume');
    const btnDrawerSound = document.getElementById('btn-drawer-sound');
    const soundStatus = document.getElementById('sound-status');
    const soundIcon = document.getElementById('sound-icon');
    const btnDrawerExit = document.getElementById('btn-drawer-exit');

    let soundEnabled = true;

    if (btnMenuTrigger && gameMenuDrawer) {
      btnMenuTrigger.addEventListener('click', () => {
        gameMenuDrawer.classList.remove('hidden');
      });
    }

    if (btnDrawerClose && gameMenuDrawer) {
      btnDrawerClose.addEventListener('click', () => {
        gameMenuDrawer.classList.add('hidden');
      });
    }

    if (btnDrawerResume && gameMenuDrawer) {
      btnDrawerResume.addEventListener('click', () => {
        gameMenuDrawer.classList.add('hidden');
      });
    }

    if (gameMenuDrawer) {
      gameMenuDrawer.addEventListener('click', (e) => {
        if (e.target === gameMenuDrawer) {
          gameMenuDrawer.classList.add('hidden');
        }
      });
    }

    if (btnDrawerSound) {
      btnDrawerSound.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        if (soundStatus) soundStatus.textContent = soundEnabled ? 'ON' : 'OFF';
        if (soundIcon) soundIcon.className = soundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
        showToast(soundEnabled ? '🔊 Sound Enabled' : '🔇 Sound Muted');
      });
    }

    if (btnDrawerExit) {
      btnDrawerExit.addEventListener('click', () => {
        showGameConfirm('Are you sure you want to exit to the main menu?', (confirmed) => {
          if (confirmed) {
            const drawer = document.getElementById('game-menu-drawer');
            if (drawer) drawer.classList.add('hidden');

            if (appState.roomId) {
              socket.emit('leave_room', { roomId: appState.roomId });
            }

            appState.roomId = null;
            appState.isHost = false;
            appState.mode = null;
            appState.selectedCardId = null;
            appState.pendingWildCardId = null;

            showScreen('menu-screen');
            showToast('🏠 Returned to Main Menu');
          }
        }, 'EXIT GAME');
      });
    }

    // Play Again & Home from Victory Modal
    if (btnRestart) {
      btnRestart.addEventListener('click', () => {
        if (!appState.isHost) {
          showToast('Only the host can start the next match.');
          return;
        }
        if (!appState.isAdmin && (window.UnoEconomy?.getProfile().coins ?? 0) < appState.stake) {
          showToast(`You need ${appState.stake} coins to play again. Return to the menu to choose a lower stake.`);
          return;
        }
        const gameOverModal = document.getElementById('game-over-modal');
        if (gameOverModal) gameOverModal.classList.add('hidden');
        if (appState.roomId) {
          socket.emit('start_game', { roomId: appState.roomId });
        }
      });
    }

    if (btnHome) {
      btnHome.addEventListener('click', () => {
        window.location.reload();
      });
    }

    // Color Picker Modal Choice Buttons
    document.querySelectorAll('.color-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const chosenColor = btn.getAttribute('data-color');
        const colorModal = document.getElementById('color-picker-modal');
        if (colorModal) colorModal.classList.add('hidden');

        if (appState.pendingWildCardId && appState.roomId) {
          const wildCardId = appState.pendingWildCardId;
          const wildCardIndex = appState.pendingWildCardIndex;
          const wildCard = appState.latestServerState?.myHand?.find(card => String(card.id) === String(wildCardId));
          const hand = document.getElementById('player-cards-fan');
          const wildElement = hand && Array.from(hand.querySelectorAll('.card-3d'))
            .find(cardEl => cardEl.dataset.cardId === String(wildCardId));
          appState.pendingAction = 'play';
          window.pendingWildChosenColor = chosenColor;
          if (wildCard && wildElement) startDiscardFlight(wildCard, wildElement);
          socket.emit('play_card', {
            roomId: appState.roomId,
            cardId: wildCardId,
            cardIndex: wildCardIndex,
            chosenColor: chosenColor
          });

          appState.pendingWildCardId = null;
          appState.pendingWildCardIndex = null;
          setTimeout(() => { window.pendingWildChosenColor = null; }, 3000);

          setTimeout(() => {
            if (appState.pendingAction === 'play') appState.pendingAction = null;
          }, 3000);
        }
      });
    });

    updateGameScaling();
    initLayoutCustomizer();

    console.log('🎮 UNO 3D Perspective Game Client fully initialized.');
  }

  function startDrawGhost(deck, onArrive) {
    const hand = document.getElementById('player-cards-fan');
    if (!hand) { onArrive(); return; }
    const handCards = Array.from(hand.children)
      .filter(card => card.classList.contains('card-3d') && !card.classList.contains('draw-flight-card'));
    const count = handCards.length + 1;
    const targetIndex = handCards.length;
    const probe = create3DCardElement(null, targetIndex, 0, true);
    probe.style.cssText = 'position:absolute;bottom:0;visibility:hidden;pointer-events:none;transform:none;transform-origin:bottom center;';
    hand.appendChild(probe);
    const unrotated = probe.getBoundingClientRect();
    const { x, y, angle } = getPlayerHandCardPlacement(hand, count, targetIndex, unrotated.width);
    probe.style.setProperty('--x', x);
    probe.style.setProperty('--y', y);
    probe.style.setProperty('--angle', angle);
    probe.style.setProperty('--index', targetIndex);
    probe.style.transform = `translateX(${x}px) translateY(${y}px) rotateZ(${angle}deg) scale(1)`;
    const destination = probe.getBoundingClientRect();
    probe.remove();

    // Match the ghost's transformed bounds to the exact future hand card bounds.
    const radians = angle * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const determinant = cos * cos - sin * sin;
    const ghostWidth = (destination.width * cos - destination.height * sin) / determinant;
    const ghostHeight = (destination.height * cos - destination.width * sin) / determinant;
    const targetCenterX = destination.left + destination.width / 2;
    const targetCenterY = destination.top + destination.height / 2;
    const targetBaseX = targetCenterX - ghostWidth / 2 - ghostHeight * sin / 2;
    const targetBaseY = targetCenterY - ghostHeight + ghostHeight * cos / 2;
    const source = deck.getBoundingClientRect();
    const startX = source.left + (source.width - ghostWidth) / 2;
    const startY = source.top + (source.height - ghostHeight) / 2;
    let overlay = document.getElementById('ghost-animation-overlay');
    if (!overlay) {
      overlay = document.createElement('div'); overlay.id = 'ghost-animation-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
      document.body.appendChild(overlay);
    }
    const ghost = document.createElement('div');
    ghost.className = 'draw-flight-card';
    const backFace = create3DCardElement(null, 0, 0, true);
    backFace.classList.add('draw-flight-face', 'draw-flight-back');
    backFace.style.zIndex = String(handCards.length);
    ghost.appendChild(backFace);
    Object.assign(ghost.style, {
      left: `${startX}px`, top: `${startY}px`, width: `${ghostWidth}px`, height: `${ghostHeight}px`,
      transform: 'translate3d(0,0,0) scale(.95) rotate(0deg)'
    });
    overlay.appendChild(ghost);
    ghost.getBoundingClientRect();
    requestAnimationFrame(() => {
      ghost.style.transform = `translate3d(${targetBaseX - startX}px,${targetBaseY - startY}px,0) scale(1) rotate(${angle}deg)`;
    });
    const baseIds = new Set((appState.latestServerState?.myHand || []).map(card => String(card?.id)));
    const pending = { el: ghost, arrived: false, flightDone: false, baseCount: handCards.length, baseIds };
    window.pendingDrawGhost = pending;
    const arrive = () => {
      if (window.pendingDrawGhost !== pending || pending.arrived) return;
      pending.arrived = true;
      pending.flightDone = true;
      onArrive();
      if (pending.card) revealDrawGhost(pending);
    };
    ghost.addEventListener('transitionend', arrive, { once: true });
    setTimeout(arrive, 500);
  }

  function revealDrawGhost(pending) {
    if (!pending || !pending.flightDone || pending.handedOff || !pending.card || window.pendingDrawGhost !== pending) return;
    pending.handedOff = true;
    const landingRect = pending.el.getBoundingClientRect();
    pending.el.remove();
    window.pendingDrawGhost = null;
    window.drawRevealCardId = String(pending.card.id);
    renderGame(pending.state);
    const hand = document.getElementById('player-cards-fan');
    const realCard = hand && Array.from(hand.children)
      .find(card => card.dataset.cardId === String(pending.card.id));
    if (realCard) {
      alignCardToLanding(realCard, landingRect);
      setTimeout(() => realCard.classList.add('is-revealed'), 100);
      // Let the reveal finish at the pile landing point, then ease the card into
      // its permanent fan position before replacing the 3D flip markup.
      setTimeout(() => {
        if (!realCard.isConnected || !hand) return;
        const targetX = parseFloat(realCard.style.getPropertyValue('--x')) || 0;
        const targetY = parseFloat(realCard.style.getPropertyValue('--y')) || 0;
        const targetAngle = parseFloat(realCard.style.getPropertyValue('--angle')) || 0;
        const targetTransform = `translateX(${targetX}px) translateY(${targetY}px) rotateZ(${targetAngle}deg) scale(1)`;
        realCard.style.transform = targetTransform;

        setTimeout(() => {
          if (!realCard.isConnected || !hand) return;
          const index = Array.from(hand.children).indexOf(realCard);
          if (index < 0) return;
          const faceUpCard = create3DCardElement(pending.card, index, 0, false);
          faceUpCard.dataset.cardId = String(pending.card.id);
          ['--x', '--y', '--angle', '--index', '--i'].forEach(name => {
            faceUpCard.style.setProperty(name, realCard.style.getPropertyValue(name));
          });
          ['position', 'bottom', 'transformOrigin', 'zIndex'].forEach(name => {
            faceUpCard.style[name] = realCard.style[name];
          });
          faceUpCard.style.transform = targetTransform;
          if (pending.state.lastDrawnCardId && String(pending.state.lastDrawnCardId) === String(pending.card.id)) {
            faceUpCard.classList.add('just-drawn');
          }
          faceUpCard.addEventListener('click', () => handleCardClick(pending.card, faceUpCard, index));
          realCard.replaceWith(faceUpCard);
        }, 280);
      }, 760);
    }
  }

  function createDrawRevealCardElement(card, index) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card-3d draw-reveal-card';
    cardEl.style.setProperty('--i', index);
    const back = create3DCardElement(null, index, 0, true);
    const front = create3DCardElement(card, index, 0, false);
    back.classList.add('draw-reveal-side', 'draw-reveal-back');
    front.classList.add('draw-reveal-side', 'draw-reveal-front');
    back.style.transform = 'rotateY(0deg)';
    front.style.transform = 'rotateY(180deg)';
    back.style.transformOrigin = 'center center';
    front.style.transformOrigin = 'center center';
    const flipper = document.createElement('div');
    flipper.className = 'draw-reveal-inner';
    flipper.append(back, front);
    cardEl.appendChild(flipper);
    return cardEl;
  }

  function alignCardToLanding(card, landingRect) {
    const currentRect = card.getBoundingClientRect();
    const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--board-scale')) || 1;
    const offsetX = (landingRect.left + landingRect.width / 2 - currentRect.left - currentRect.width / 2) / scale;
    const offsetY = (landingRect.top + landingRect.height / 2 - currentRect.top - currentRect.height / 2) / scale;
    const x = parseFloat(card.style.getPropertyValue('--x')) || 0;
    const y = parseFloat(card.style.getPropertyValue('--y')) || 0;
    const angle = parseFloat(card.style.getPropertyValue('--angle')) || 0;
    card.style.transform = `translateX(${x + offsetX}px) translateY(${y + offsetY}px) rotateZ(${angle}deg) scale(1)`;
  }

  // ==========================================================================
  // CUSTOMIZE LAYOUT SETTINGS
  // ==========================================================================

  const DEFAULT_LAYOUT = {
    boardScale: 1.0,
    cardScale: 1.0,
    botScale: 1.0,
    fontScale: 1.0
  };

  function loadLayoutPreferences() {
    try {
      const saved = localStorage.getItem('uno_layout_prefs');
      const prefs = saved ? JSON.parse(saved) : DEFAULT_LAYOUT;
      applyLayoutPreferences(prefs);
      syncLayoutSliders(prefs);
    } catch (e) {
      console.warn('Failed to load layout preferences:', e);
      applyLayoutPreferences(DEFAULT_LAYOUT);
      syncLayoutSliders(DEFAULT_LAYOUT);
    }
  }

  function saveLayoutPreferences(prefs) {
    try {
      localStorage.setItem('uno_layout_prefs', JSON.stringify(prefs));
    } catch (e) {
      console.warn('Failed to save layout preferences:', e);
    }
  }

  function applyLayoutPreferences(prefs) {
    const root = document.documentElement;
    root.style.setProperty('--board-scale', prefs.boardScale);
    root.style.setProperty('--card-scale', prefs.cardScale);
    root.style.setProperty('--bot-scale', prefs.botScale);
    root.style.setProperty('--font-scale', prefs.fontScale);
  }

  function syncLayoutSliders(prefs) {
    const sBoard = document.getElementById('slider-board-scale');
    const sCard = document.getElementById('slider-card-size');
    const sBot = document.getElementById('slider-bot-size');
    const sFont = document.getElementById('slider-font-scale');

    if (sBoard) {
      sBoard.value = prefs.boardScale;
      const v1 = document.getElementById('val-board-scale');
      if (v1) v1.textContent = `${Number(prefs.boardScale).toFixed(2)}x`;
    }
    if (sCard) {
      sCard.value = prefs.cardScale;
      const v2 = document.getElementById('val-card-size');
      if (v2) v2.textContent = `${Number(prefs.cardScale).toFixed(2)}x`;
    }
    if (sBot) {
      sBot.value = prefs.botScale;
      const v3 = document.getElementById('val-bot-size');
      if (v3) v3.textContent = `${Number(prefs.botScale).toFixed(2)}x`;
    }
    if (sFont) {
      sFont.value = prefs.fontScale;
      const v4 = document.getElementById('val-font-scale');
      if (v4) v4.textContent = `${Number(prefs.fontScale).toFixed(2)}x`;
    }
  }

  function initLayoutCustomizer() {
    loadLayoutPreferences();

    const modal = document.getElementById('layout-customizer-modal');
    const btnOpenMenu = document.getElementById('btn-customize-layout');
    const btnOpenDrawer = document.getElementById('btn-drawer-layout');
    const btnClose = document.getElementById('btn-layout-close');
    const btnSave = document.getElementById('btn-layout-save');
    const btnReset = document.getElementById('btn-layout-reset');

    const sBoard = document.getElementById('slider-board-scale');
    const sCard = document.getElementById('slider-card-size');
    const sBot = document.getElementById('slider-bot-size');
    const sFont = document.getElementById('slider-font-scale');

    function openModal() {
      if (modal) modal.classList.remove('hidden');
      const gameMenuDrawer = document.getElementById('game-menu-drawer');
      if (gameMenuDrawer) gameMenuDrawer.classList.add('hidden');
    }

    function closeModal() {
      if (modal) modal.classList.add('hidden');
    }

    if (btnOpenMenu) btnOpenMenu.addEventListener('click', openModal);
    if (btnOpenDrawer) btnOpenDrawer.addEventListener('click', openModal);
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnSave) btnSave.addEventListener('click', closeModal);

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }

    const handleSliderChange = () => {
      const prefs = {
        boardScale: parseFloat(sBoard ? sBoard.value : 1.0),
        cardScale: parseFloat(sCard ? sCard.value : 1.0),
        botScale: parseFloat(sBot ? sBot.value : 1.0),
        fontScale: parseFloat(sFont ? sFont.value : 1.0)
      };

      const v1 = document.getElementById('val-board-scale');
      const v2 = document.getElementById('val-card-size');
      const v3 = document.getElementById('val-bot-size');
      const v4 = document.getElementById('val-font-scale');

      if (v1) v1.textContent = `${prefs.boardScale.toFixed(2)}x`;
      if (v2) v2.textContent = `${prefs.cardScale.toFixed(2)}x`;
      if (v3) v3.textContent = `${prefs.botScale.toFixed(2)}x`;
      if (v4) v4.textContent = `${prefs.fontScale.toFixed(2)}x`;

      applyLayoutPreferences(prefs);
      saveLayoutPreferences(prefs);
      relayoutPlayerHand();
    };

    if (sBoard) sBoard.addEventListener('input', handleSliderChange);
    if (sCard) sCard.addEventListener('input', handleSliderChange);
    if (sBot) sBot.addEventListener('input', handleSliderChange);
    if (sFont) sFont.addEventListener('input', handleSliderChange);

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        applyLayoutPreferences(DEFAULT_LAYOUT);
        syncLayoutSliders(DEFAULT_LAYOUT);
        saveLayoutPreferences(DEFAULT_LAYOUT);
        relayoutPlayerHand();
        showToast('🔄 Layout reset to default');
      });
    }
  }

  // Document ready lifecycle
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindDomEvents);
  } else {
    bindDomEvents();
  }
})();
