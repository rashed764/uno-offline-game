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
    latestServerState: null
  };

  // Expose appState globally for testing or dev console inspection
  window.appState = appState;
  window.isDealingOrFanning = false;

  // ==========================================================================
  // FULLSCREEN & RESPONSIVE CANVAS SCALING
  // ==========================================================================

  function requestFullscreenApp() {
    const elem = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement && !document.msFullscreenElement) {
      if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => {
          console.log('[Fullscreen] Request ignored or blocked by browser:', err);
        });
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      } else if (elem.mozRequestFullScreen) {
        elem.mozRequestFullScreen();
      } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
      }
    }
  }

  function updateGameScaling() {
    const scaler = document.getElementById('screen-scaler');
    if (!scaler) return;

    if (window.innerWidth <= 768) {
      scaler.style.transform = 'translate(-50%, -50%) scale(1)';
      scaler.style.width = '100%';
      scaler.style.height = '100%';
      return;
    }

    const designWidth = 1200;
    const designHeight = 800;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const scaleX = windowWidth / designWidth;
    const scaleY = windowHeight / designHeight;
    const scale = Math.min(scaleX, scaleY);

    scaler.style.transform = `translate(-50%, -50%) scale(${scale})`;
    scaler.style.width = '1200px';
    scaler.style.height = '800px';
  }

  window.addEventListener('resize', updateGameScaling);
  window.addEventListener('orientationchange', () => {
    setTimeout(updateGameScaling, 250);
  });

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
  });

  // Room Created / Joined
  socket.on('room_created', ({ roomId, player, mode, players }) => {
    console.log(`[Lobby] Room ready: ${roomId} (Host: ${player?.isHost})`);
    appState.roomId = roomId;
    appState.isHost = Boolean(player?.isHost);
    appState.mode = mode;
    if (player && player.id) {
      appState.myPlayerId = player.id;
    }

    const codeEl = document.getElementById('lobby-room-code');
    if (codeEl) {
      codeEl.textContent = roomId;
    }

    const playerList = players || (player ? [{ id: player.id, name: player.name, isHost: player.isHost }] : []);
    updatePlayersLobbyList(playerList);

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

  // Game Started Event - Immediate transition & authoritative UI render
  socket.on('game_started', (payload) => {
    const gameState = (payload && payload.gameState) ? payload.gameState : payload;
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
    animateRemoteDiscard(previousState, gameState, remoteDiscardSource);
    animateRemoteDraw(remoteDrawEvent, gameState);
  });

  // Direct state sync packet
  socket.on('game_state', (payload) => {
    appState.pendingAction = null;
    const gameState = (payload && payload.gameState) ? payload.gameState : payload;
    const previousState = appState.latestServerState;
    const remoteDiscardSource = captureRemoteDiscardSource(previousState, gameState);
    const remoteDrawEvent = captureRemoteDrawEvent(previousState, gameState);
    appState.latestServerState = gameState;

    if (window.isDealingOrFanning || appState.isDealingOrFanning) {
      console.log('[Socket] game_state received during dealing/fanning - deferred.');
      return;
    }

    renderGame(gameState);
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
  socket.on('game_over', ({ winnerName, message }) => {
    const titleEl = document.getElementById('game-winner-title');
    const msgEl = document.getElementById('game-winner-message');
    const modalEl = document.getElementById('game-over-modal');

    if (titleEl) titleEl.textContent = `${(winnerName || 'WINNER').toUpperCase()} WINS!`;
    if (msgEl) msgEl.textContent = message || `${winnerName} has won the match!`;
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

    const ghostEl = document.createElement('div');
    ghostEl.className = 'ghost-card-anim';

    if (cardData && cardData.color && cardData.value) {
      const isWild = (cardData.color === 'wild' || cardData.color === 'wild_draw4' || cardData.value === 'wild' || cardData.value === 'wild_draw4');
      const colorClass = isWild ? 'card-black' : `card-${cardData.color}`;
      const displayVal = getCardDisplayValue(cardData.value);
      const displayIcon = getCardDisplayIcon(cardData.value);
      ghostEl.className += ` card-front ${colorClass}`;
      ghostEl.innerHTML = `
        <div class="card-inner">
          <div class="card-corner top-left">${displayVal}</div>
          <div class="card-inner-ellipse">
            ${displayIcon ? `<i class="${displayIcon}"></i>` : `<span class="card-center-val">${displayVal}</span>`}
          </div>
          <div class="card-corner bottom-right">${displayVal}</div>
        </div>
      `;
    } else {
      ghostEl.className += ' card-back';
      ghostEl.innerHTML = `
        <div class="card-inner">
          <div class="card-inner-ellipse"></div>
        </div>
      `;
    }

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
                const totalCards = cardEls.length;
                const maxSpreadAngle = 40;
                const availableWidth = handContainer.clientWidth || 380;
                const cardWidth = cardEls[0] ? cardEls[0].getBoundingClientRect().width : 64;
                const spreadWidth = totalCards > 1
                  ? Math.min(380, totalCards * 40, Math.max(0, availableWidth - cardWidth - 16))
                  : 0;

                cardEls.forEach((cardEl, idx) => {
                  const angle = totalCards > 1 ? - (maxSpreadAngle / 2) + (idx * (maxSpreadAngle / (totalCards - 1))) : 0;
                  const targetX = totalCards > 1 ? - (spreadWidth / 2) + (idx * (spreadWidth / (totalCards - 1))) : 0;
                  const targetY = Math.abs(angle) * 0.8;

                  cardEl.style.setProperty('--x', targetX);
                  cardEl.style.setProperty('--y', targetY);
                  cardEl.style.setProperty('--angle', angle);
                  cardEl.style.setProperty('--i', idx);
                  cardEl.classList.add('fanning-transition');
                  cardEl.style.transform = `translateX(${targetX}px) translateY(${targetY}px) rotateZ(${angle}deg) scale(1)`;
                });
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
      directionRing.className = `direction-ring-3d ${state.direction === -1 ? 'counter-clockwise' : 'clockwise'}`;
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
        myTitleEl.innerHTML = `<i class="fa-solid fa-play"></i> YOUR TURN!`;
      } else {
        myTitleEl.classList.remove('active-turn');
        myTitleEl.textContent = state.currentTurnPlayerName
          ? `${state.currentTurnPlayerName}'s Turn`
          : 'Your Hand';
      }
    }

    // 3. Dynamic 3D Table Glow representing current color
    const tablePlate = document.querySelector('.table-3d-plate');
    if (tablePlate) {
      const rawColor = state.currentColor || (state.topCard ? state.topCard.color : 'red');
      const activeColor = ['red', 'blue', 'green', 'yellow'].includes(rawColor) ? rawColor : 'red';
      tablePlate.style.boxShadow = `0 15px 40px rgba(0, 0, 0, 0.6), 
                                    inset 0 0 45px rgba(0, 0, 0, 0.8),
                                    0 0 30px var(--uno-${activeColor})`;
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

        const availableWidth = handContainer.clientWidth || 380;
        const cardWidth = renderedCards[0]?.getBoundingClientRect().width || 64;
        const spreadWidth = totalCards > 1
          ? Math.min(380, totalCards * 40, Math.max(0, availableWidth - cardWidth - 16))
          : 0;
        renderedCards.forEach((cardEl, idx) => {
          const angle = totalCards > 1 ? -20 + idx * (40 / (totalCards - 1)) : 0;
          const targetX = totalCards > 1 ? -spreadWidth / 2 + idx * (spreadWidth / (totalCards - 1)) : 0;
          const targetY = Math.abs(angle) * 0.8;
          cardEl.style.setProperty('--x', targetX);
          cardEl.style.setProperty('--y', targetY);
          cardEl.style.setProperty('--angle', angle);
          cardEl.style.setProperty('--index', idx);
          cardEl.style.setProperty('--i', idx);
          cardEl.style.position = 'absolute';
          cardEl.style.transformOrigin = 'bottom center';
          cardEl.style.transform = `translateX(${targetX}px) translateY(${targetY}px) rotateZ(${angle}deg) scale(1)`;
        });
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

    if (seatTop) seatTop.classList.add('hidden');
    if (seatLeft) seatLeft.classList.add('hidden');
    if (seatRight) seatRight.classList.add('hidden');

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

    if (leftPlayer && seatLeft) {
      bindSeatData('left', leftPlayer, state.currentTurnPlayerId);
      seatLeft.classList.remove('hidden');
    }
    if (topPlayer && seatTop) {
      bindSeatData('top', topPlayer, state.currentTurnPlayerId);
      seatTop.classList.remove('hidden');
    }
    if (rightPlayer && seatRight) {
      bindSeatData('right', rightPlayer, state.currentTurnPlayerId);
      seatRight.classList.remove('hidden');
    }
  }

  function bindSeatData(position, player, currentTurnPlayerId) {
    const nameEl = document.getElementById(`opp-${position}-name`);
    if (nameEl) {
      nameEl.innerHTML = player.isBot
        ? `<i class="fa-solid fa-robot"></i> ${player.name}`
        : `<i class="fa-solid fa-user-astronaut"></i> ${player.name}`;
    }

    const countEl = document.getElementById(`opp-${position}-count`);
    const cardCount = typeof player.cardCount === 'number'
      ? player.cardCount
      : (Number.isFinite(player.cardCount) ? player.cardCount : (Array.isArray(player.hand) ? player.hand.length : (player.handLength || 0)));

    if (countEl && !window.isDealingOrFanning) {
      countEl.textContent = cardCount;
    }

    const isCurrentTurn = Boolean(player.id && String(player.id) === String(currentTurnPlayerId));

    const oppSeat = document.querySelector(`.seat-${position}`);
    if (oppSeat) {
      if (isCurrentTurn) oppSeat.classList.add('active-turn');
      else oppSeat.classList.remove('active-turn');
    }

    const oppInfoEl = document.querySelector(`.seat-${position} .opp-info`);
    if (oppInfoEl) {
      if (isCurrentTurn) oppInfoEl.classList.add('active-turn');
      else oppInfoEl.classList.remove('active-turn');
    }

    const oppCardEl = document.querySelector(`.seat-${position} .opponent-card`);
    if (oppCardEl) {
      if (isCurrentTurn) oppCardEl.classList.add('active-turn');
      else oppCardEl.classList.remove('active-turn');
    }

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
  function create3DCardElement(card, index = 0, angle = 0, isBack = false) {
    const cardEl = document.createElement('div');

    if (isBack) {
      cardEl.className = 'card-3d card-back';
      cardEl.style.setProperty('--i', index);
      cardEl.innerHTML = `
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

    cardEl.className = `card-3d card-front ${colorClass}`;
    cardEl.style.setProperty('--i', index);
    cardEl.style.setProperty('--r', angle);

    cardEl.innerHTML = `
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
    if (isSkip) ghost.classList.add('power-card-glow');
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
      skipTargetId: isSkip ? getSkippedPlayerId(beforeState) : null };
    window.pendingDiscardFlight = pending;
    requestAnimationFrame(() => {
      ghost.style.transform = `translate3d(${endCenterX - sourceCenterX}px,${endCenterY - sourceCenterY}px,0) scale(1) rotate(${randomAngle}deg)`;
    });
    const land = () => {
      if (window.pendingDiscardFlight !== pending || pending.landed) return;
      pending.landed = true;
      if (pending.state) finishDiscardFlight(pending);
    };
    ghost.addEventListener('transitionend', land, { once: true });
    setTimeout(land, 500);
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
    window.pendingDiscardFlight = null;
    renderGame(pending.state, pending.rotation);
    if (pending.skipTargetId != null) playSkipImpact(pending.skipTargetId, pending.state);
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
    const targetId = isSkip ? getSkippedPlayerId(previousState) : null;
    const signature = `${actorId}:${nextState.topCard.id}`;
    if ((isSkip && targetId == null) || signature === window.lastRemoteDiscardAnimationKey) return;
    window.lastRemoteDiscardAnimationKey = signature;

    const actorSeat = getOpponentPositionName(actorId, previousState.players || [], appState.myPlayerId || socket.id);
    const sourceEl = actorSeat ? document.getElementById(`opp-${actorSeat}-cards`) : null;
    const pile = document.getElementById('discard-pile-3d');
    if (!sourceEl || !pile) {
      if (isSkip) playSkipImpact(targetId, nextState);
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
    Object.assign(ghost.style, {
      position: 'absolute', left: `${startCenterX - width / 2}px`, top: `${startCenterY - height / 2}px`,
      width: `${width}px`, height: `${height}px`, zIndex: '10000',
      transform: `translate3d(0,0,0) scale(${source.width / width},${source.height / height}) rotate(-8deg)`
    });
    overlay.appendChild(ghost);
    if (pileCard) pileCard.style.visibility = 'hidden';
    ghost.getBoundingClientRect();
    requestAnimationFrame(() => {
      ghost.style.transform = `translate3d(${endCenterX - startCenterX}px,${endCenterY - startCenterY}px,0) scale(1) rotate(0deg)`;
    });

    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      ghost.remove();
      if (pileCard?.isConnected) pileCard.style.visibility = '';
      if (isSkip) playSkipImpact(targetId, nextState);
    };
    ghost.addEventListener('transitionend', land, { once: true });
    setTimeout(land, 520);
  }

  function cancelDiscardFlight() {
    const pending = window.pendingDiscardFlight;
    if (!pending) return;
    pending.el.remove();
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
        if (colorModal) colorModal.classList.remove('hidden');
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

  function bindDomEvents() {
    const nameInput = document.getElementById('player-name');
    const btnVsAi = document.getElementById('btn-vs-ai');
    const btnCreateRoom = document.getElementById('btn-create-room');
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

    // Vs AI Mode
    if (btnVsAi) {
      btnVsAi.addEventListener('click', () => {
        requestFullscreenApp();
        const name = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : 'Player 1';
        appState.playerName = name;
        socket.emit('create_room', { playerName: name, mode: 'ai' });
      });
    }

    // Create LAN Lobby
    if (btnCreateRoom) {
      btnCreateRoom.addEventListener('click', () => {
        requestFullscreenApp();
        const name = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : 'Player 1';
        appState.playerName = name;
        socket.emit('create_room', { playerName: name, mode: 'lan' });
      });
    }

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
        socket.emit('join_room', { roomId: roomCode, playerName: name });
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
          if (wildCard && wildElement) startDiscardFlight(wildCard, wildElement);
          socket.emit('play_card', {
            roomId: appState.roomId,
            cardId: wildCardId,
            cardIndex: wildCardIndex,
            chosenColor: chosenColor
          });

          appState.pendingWildCardId = null;
          appState.pendingWildCardIndex = null;

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
    const handCards = Array.from(hand.querySelectorAll('.card-3d'));
    const count = handCards.length + 1;
    const targetIndex = handCards.length;
    const angle = count > 1 ? -20 + targetIndex * (40 / (count - 1)) : 0;
    const y = Math.abs(angle) * 0.8;
    const probe = create3DCardElement(null, targetIndex, angle, true);
    probe.style.cssText = 'position:absolute;bottom:0;visibility:hidden;pointer-events:none;transform:none;transform-origin:bottom center;';
    hand.appendChild(probe);
    const unrotated = probe.getBoundingClientRect();
    const spread = count > 1
      ? Math.min(380, count * 40, Math.max(0, (hand.clientWidth || 380) - unrotated.width - 16))
      : 0;
    const x = count > 1 ? -spread / 2 + targetIndex * (spread / (count - 1)) : 0;
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
    const realCard = hand && Array.from(hand.querySelectorAll('.card-3d'))
      .find(card => card.dataset.cardId === String(pending.card.id));
    if (realCard) {
      alignCardToLanding(realCard, landingRect);
      setTimeout(() => realCard.classList.add('is-revealed'), 100);
      // Commit the revealed card to the normal hand markup after the 3D flip.
      // This keeps the front visible even if a browser drops a 3D backface frame.
      setTimeout(() => {
        if (!realCard.isConnected || !hand) return;
        const index = Array.from(hand.querySelectorAll('.card-3d')).indexOf(realCard);
        if (index < 0) return;
        const faceUpCard = create3DCardElement(pending.card, index, 0, false);
        faceUpCard.dataset.cardId = String(pending.card.id);
        ['--x', '--y', '--angle', '--index', '--i'].forEach(name => {
          faceUpCard.style.setProperty(name, realCard.style.getPropertyValue(name));
        });
        ['position', 'bottom', 'transformOrigin', 'zIndex', 'transform'].forEach(name => {
          faceUpCard.style[name] = realCard.style[name];
        });
        if (pending.state.lastDrawnCardId && String(pending.state.lastDrawnCardId) === String(pending.card.id)) {
          faceUpCard.classList.add('just-drawn');
        }
        faceUpCard.addEventListener('click', () => handleCardClick(pending.card, faceUpCard, index));
        realCard.replaceWith(faceUpCard);
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
    card.style.setProperty('--x', x + offsetX);
    card.style.setProperty('--y', y + offsetY);
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
