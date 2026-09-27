/**
 * Frontend Interaction Handlers & Color Picker Controller (3D Perspective Edition)
 */
function initApp() {
  const appState = window.appState;
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
  const btnUno = document.getElementById('btn-uno');
  const btnExitGame = document.getElementById('btn-exit-game');
  
  // Game Over Modal Buttons
  const btnRestart = document.getElementById('btn-restart');
  const btnHome = document.getElementById('btn-home');

  console.log('⚡ UNO App Initialized, Binding Listeners...');

  // Play vs Computer AI
  if (btnVsAi) {
    btnVsAi.addEventListener('click', () => {
      const name = nameInput.value.trim() || 'Player 1';
      appState.playerName = name;
      socket.emit('create_room', { playerName: name, mode: 'ai' });
    });
  }

  // Host Local Wi-Fi Game
  if (btnCreateRoom) {
    btnCreateRoom.addEventListener('click', () => {
      const name = nameInput.value.trim() || 'Player 1';
      appState.playerName = name;
      socket.emit('create_room', { playerName: name, mode: 'lan' });
    });
  }

  // Show Join Input Box Toggle
  if (btnShowJoin) {
    btnShowJoin.addEventListener('click', () => {
      joinBox.classList.toggle('hidden');
    });
  }

  // Join Room Button
  if (btnJoinRoom) {
    btnJoinRoom.addEventListener('click', () => {
      const name = nameInput.value.trim() || 'Player 1';
      const roomCode = roomCodeInput.value.trim();

      if (!roomCode) {
        showToast('⚠️ Please enter a 6-character room code!');
        return;
      }

      appState.playerName = name;
      socket.emit('join_room', { roomId: roomCode, playerName: name });
    });
  }

  // Start Game Button
  if (btnStartGame) {
    btnStartGame.addEventListener('click', () => {
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

  // Draw Card from 3D Pile
  if (drawDeck3d) {
    drawDeck3d.addEventListener('click', () => {
      if (appState.roomId) {
        socket.emit('draw_card', { roomId: appState.roomId });
      }
    });
  }

  // UNO Button Click Call
  if (btnUno) {
    btnUno.addEventListener('click', () => {
      showToast('📣 Called UNO!');
      socket.emit('call_uno', { roomId: appState.roomId });
    });
  }

  // Exit Active Game
  if (btnExitGame) {
    btnExitGame.addEventListener('click', () => {
      window.location.reload();
    });
  }

  // Restart Match
  if (btnRestart) {
    btnRestart.addEventListener('click', () => {
      document.getElementById('game-over-modal').classList.add('hidden');
      if (appState.roomId) {
        socket.emit('start_game', { roomId: appState.roomId });
      }
    });
  }

  // Go to main menu
  if (btnHome) {
    btnHome.addEventListener('click', () => {
      window.location.reload();
    });
  }

  // Color Picker Modal Buttons for Wild Card Colors
  document.querySelectorAll('.color-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const chosenColor = btn.getAttribute('data-color');
      document.getElementById('color-picker-modal').classList.add('hidden');

      if (appState.pendingWildCardId && appState.roomId) {
        socket.emit('play_card', {
          roomId: appState.roomId,
          cardId: appState.pendingWildCardId,
          chosenColor: chosenColor
        });
        appState.pendingWildCardId = null;
      }
    });
  });
}

// Bulletproof document ready state listener
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Helper Function to Switch Screen Views
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
  }
}
window.showScreen = showScreen;

// 3D Styled Toast Notification Helper
function showToast(msg) {
  const toast = document.getElementById('toast-message');
  if (!toast) return;

  toast.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${msg}`;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 2800);
}
window.showToast = showToast;
