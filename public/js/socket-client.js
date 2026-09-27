/**
 * Socket.io Real-time Client Handler & Game Rendering Engine (3D Perspective Edition)
 */
const socket = io();

// Application State
window.appState = {
  playerName: 'Player 1',
  roomId: null,
  isHost: false,
  mode: null,
  pendingWildCardId: null
};

const appState = window.appState;

// ==========================================================================
// SOCKET EVENT LISTENERS
// ==========================================================================

socket.on('connect', () => {
  console.log('🔗 Connected to UNO 3D Server. ID:', socket.id);
});

socket.on('room_created', ({ roomId, player, mode }) => {
  appState.roomId = roomId;
  appState.isHost = player.isHost;
  appState.mode = mode;

  document.getElementById('lobby-room-code').textContent = roomId;
  updatePlayersLobbyList([{ id: player.id, name: player.name, isHost: player.isHost }]);

  if (player.isHost) {
    document.getElementById('btn-start-game').classList.remove('hidden');
  }

  if (window.showScreen) {
    window.showScreen('lobby-screen');
  }
});

socket.on('player_joined', ({ players }) => {
  updatePlayersLobbyList(players);
});

socket.on('player_left', ({ players }) => {
  updatePlayersLobbyList(players);
});

socket.on('game_started', ({ gameState }) => {
  if (window.showScreen) {
    window.showScreen('game-screen');
  }
  document.getElementById('game-room-id').textContent = appState.roomId;
  renderGameBoard(gameState);
});

socket.on('update_game', ({ gameState }) => {
  // Bulletproof fallback: ensure we are on the game-screen when game updates are received
  const gameScreen = document.getElementById('game-screen');
  if (gameScreen && !gameScreen.classList.contains('active')) {
    if (window.showScreen) {
      window.showScreen('game-screen');
    }
  }
  renderGameBoard(gameState);
});

socket.on('error_message', (msg) => {
  if (window.showToast) {
    window.showToast(msg);
  }
});

socket.on('game_over', ({ winnerName, message }) => {
  document.getElementById('game-winner-title').textContent = `${winnerName.toUpperCase()} WINS!`;
  document.getElementById('game-winner-message').textContent = message || `${winnerName} has won the match!`;
  document.getElementById('game-over-modal').classList.remove('hidden');
});

// ==========================================================================
// UI RENDERERS & 3D LAYOUT ENGINE
// ==========================================================================

function updatePlayersLobbyList(players) {
  const listEl = document.getElementById('players-list');
  const countEl = document.getElementById('player-count');

  if (!listEl || !countEl) return;

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

/**
 * Main render function for the 3D tabletop board.
 */
function renderGameBoard(state) {
  // 1. Update active turn & game directions
  document.getElementById('turn-player-name').textContent = state.currentTurnPlayerName || '---';
  
  const directionContainer = document.getElementById('direction-container');
  if (directionContainer) {
    if (state.direction === 1) {
      directionContainer.className = 'clockwise';
    } else {
      directionContainer.className = 'counter-clockwise';
    }
  }

  // Set active table glow based on current card color
  const tablePlate = document.querySelector('.table-3d-plate');
  if (tablePlate) {
    const activeColor = state.currentColor || 'red';
    tablePlate.style.boxShadow = `0 40px 80px rgba(0, 0, 0, 0.7), 
                                  inset 0 0 40px rgba(0, 0, 0, 0.8),
                                  0 0 30px var(--uno-${activeColor})`;
  }

  // 2. Render Discard Pile (Top card face up)
  const discardPileContainer = document.getElementById('discard-pile-3d');
  if (discardPileContainer && state.topCard) {
    discardPileContainer.innerHTML = '';
    // Draw 3 dummy background offset cards to create realistic pile height
    for (let i = 0; i < 3; i++) {
      const dummyCard = create3DCardElement({ color: 'red', value: '0' }, i, (i * 3) - 5, false);
      dummyCard.style.opacity = '0.15';
      discardPileContainer.appendChild(dummyCard);
    }
    // Real top face-up card
    const topCardEl = create3DCardElement(state.topCard, 3, 5, false);
    discardPileContainer.appendChild(topCardEl);
  }

  // 3. Render Opponent Seats (Adapt to 2, 3 or 4 players)
  setupOpponentsSeating(state);

  // 4. Render Bottom Player Hand (3D Fan Layout)
  const handContainer = document.getElementById('player-cards-fan');
  if (handContainer) {
    handContainer.innerHTML = '';
    const totalCards = state.myHand.length;

    state.myHand.forEach((card, idx) => {
      // Create beautifully rendered card
      const cardEl = create3DCardElement(card, idx, 0, false);

      // Parabolic 3D fanning distribution parameters
      const maxSpreadAngle = 40; // Max spread of fan
      const angle = totalCards > 1 
        ? - (maxSpreadAngle / 2) + (idx * (maxSpreadAngle / (totalCards - 1))) 
        : 0;

      const spreadWidth = Math.min(350, totalCards * 40); // spread pixels
      const x = totalCards > 1 
        ? - (spreadWidth / 2) + (idx * (spreadWidth / (totalCards - 1))) 
        : 0;

      // Parabolic arc (parabola equation: y = c * x^2)
      const y = Math.abs(angle) * 0.8;

      // Inject layout variables into CSS
      cardEl.style.setProperty('--angle', angle);
      cardEl.style.setProperty('--x', x);
      cardEl.style.setProperty('--y', y);
      cardEl.style.setProperty('--index', idx);

      // Play click handler
      cardEl.addEventListener('click', () => {
        handleCardClick(card);
      });

      handContainer.appendChild(cardEl);
    });
  }
}

/**
 * Intelligent seating mapper to position other players around the 3D table.
 */
function setupOpponentsSeating(state) {
  const myIndex = state.players.findIndex(p => p.id === socket.id);
  if (myIndex === -1) return;

  // Align other players relative to current player
  const relativePlayers = [];
  for (let i = 1; i < state.players.length; i++) {
    const idx = (myIndex + i) % state.players.length;
    relativePlayers.push(state.players[idx]);
  }

  const seatTop = document.querySelector('.seat-top');
  const seatLeft = document.querySelector('.seat-left');
  const seatRight = document.querySelector('.seat-right');

  // Clear previous previews
  if (seatTop) seatTop.classList.add('hidden');
  if (seatLeft) seatLeft.classList.add('hidden');
  if (seatRight) seatRight.classList.add('hidden');

  let leftPlayer = null;
  let topPlayer = null;
  let rightPlayer = null;

  if (relativePlayers.length === 1) {
    // 2 Player game: opponent sits directly across at the TOP
    topPlayer = relativePlayers[0];
  } else if (relativePlayers.length === 2) {
    // 3 Player game: opponents sit LEFT and RIGHT
    leftPlayer = relativePlayers[0];
    rightPlayer = relativePlayers[1];
  } else if (relativePlayers.length === 3) {
    // 4 Player game: opponents sit LEFT, TOP and RIGHT
    leftPlayer = relativePlayers[0];
    topPlayer = relativePlayers[1];
    rightPlayer = relativePlayers[2];
  }

  // Bind Seating UI
  if (leftPlayer && seatLeft) {
    bindSeatData('left', leftPlayer);
    seatLeft.classList.remove('hidden');
  }
  if (topPlayer && seatTop) {
    bindSeatData('top', topPlayer);
    seatTop.classList.remove('hidden');
  }
  if (rightPlayer && seatRight) {
    bindSeatData('right', rightPlayer);
    seatRight.classList.remove('hidden');
  }
}

function bindSeatData(position, player) {
  document.getElementById(`opp-${position}-name`).textContent = player.name;
  document.getElementById(`opp-${position}-count`).textContent = player.cardCount || 0;

  const stackContainer = document.getElementById(`opp-${position}-cards`);
  if (stackContainer) {
    stackContainer.innerHTML = '';
    // Show up to 5 small card stubs for graphic visuals
    const previewCount = Math.min(5, player.cardCount || 0);
    for (let i = 0; i < previewCount; i++) {
      const cardBack = document.createElement('div');
      cardBack.className = 'opp-card-back-stub';
      stackContainer.appendChild(cardBack);
    }
  }
}

/**
 * Creates 3D representation of an UNO card (supports Front, Back & Icons).
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

  const isWild = card.color === 'wild' || card.color === 'wild_draw4';
  const colorClass = isWild ? 'card-black' : `card-${card.color}`;
  const displayVal = getCardDisplayValue(card.value);
  const displayIcon = getCardDisplayIcon(card.value);

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
  switch (val) {
    case 'skip': return '🚫';
    case 'reverse': return '🔄';
    case 'draw2': return '+2';
    case 'wild': return '🎨';
    case 'wild_draw4': return '+4';
    default: return val;
  }
}

function getCardDisplayIcon(val) {
  switch (val) {
    case 'skip': return 'fa-solid fa-ban';
    case 'reverse': return 'fa-solid fa-arrows-rotate';
    case 'wild': return 'fa-solid fa-wand-magic-sparkles';
    default: return null;
  }
}

function handleCardClick(card) {
  if (card.color === 'wild' || card.color === 'wild_draw4') {
    appState.pendingWildCardId = card.id;
    document.getElementById('color-picker-modal').classList.remove('hidden');
  } else {
    socket.emit('play_card', { roomId: appState.roomId, cardId: card.id });
  }
}
