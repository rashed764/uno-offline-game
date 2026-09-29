/**
 * Production-Ready Authoritative UNO Server
 * Real-time WebSocket Synchronization via Socket.io & Express
 */
'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { getLocalIpAddresses } = require('./src/utils/network');
const GameEngine = require('./src/game/GameEngine');
const BotPlayer = require('./src/game/BotPlayer');
const WalletDatabase = require('./src/game/WalletDatabase');
const themeCatalog = require('./public/js/theme-catalog');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// HTTP Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Active Game Rooms Map: RoomId -> GameEngine Instance
const activeGames = new Map();
const walletDatabase = new WalletDatabase();
const SHOP_ITEM_COSTS = Object.freeze(Object.fromEntries(
  [...themeCatalog.decks, ...themeCatalog.tables]
    .filter(item => item.cost > 0)
    .map(item => [item.id, item.cost])
));

function isLocalServerConnection(socket) {
  const address = String(socket.handshake.address || '').replace(/^::ffff:/, '').split('%')[0];
  return address === '127.0.0.1' || address === '::1'
    || getLocalIpAddresses().some(({ ip }) => ip === address);
}

function settleGameWager(game) {
  if (!game || game.wagerSettled || !game.winner) return;
  game.wagerSettled = true;
  const winner = game.winner;
  if (!winner.isBot && !winner.isAdmin && winner.walletId && game.stake > 0) {
    walletDatabase.credit(winner.walletId, game.stake * game.wagerPlayerCount);
  }
  game.players.filter(player => !player.isBot && player.walletId).forEach(player => {
    io.to(player.id).emit('wallet_balance', { coins: walletDatabase.getBalance(player.walletId) });
  });
}

/**
 * Sends authoritative, player-tailored game states to all connected human clients
 */
function broadcastGameState(game) {
  if (!game || !Array.isArray(game.players)) return;

  game.players.forEach(player => {
    if (!player.isBot && player.id) {
      const statePayload = game.getGameState(player.id);
      io.to(player.id).emit('update_game', {
        gameState: statePayload
      });
      io.to(player.id).emit('game_state', {
        gameState: statePayload
      });
    }
  });
}

/**
 * Automates turns for AI Bot players in both Solo vs AI and LAN modes
 */
function handleAiTurnCycle(game) {
  if (!game || !game.isGameStarted) return;

  const activePlayer = game.getActivePlayer();
  if (!activePlayer || !activePlayer.isBot) return;

  if (game.aiTimeout) {
    clearTimeout(game.aiTimeout);
    game.aiTimeout = null;
  }

  // Natural human-like bot contemplation delay (800ms - 1300ms)
  const thinkingDelay = Math.floor(Math.random() * 500) + 800;

  game.aiTimeout = setTimeout(() => {
    game.aiTimeout = null;
    if (!game.isGameStarted) return;

    const currentTurn = game.getActivePlayer();
    if (!currentTurn || String(currentTurn.id) !== String(activePlayer.id)) return;

    const topCard = game.discardPile[game.discardPile.length - 1];
    let cardToPlay = activePlayer.chooseCardToPlay(topCard, game.currentColor);

    // Occasional tactical bluff/draw heuristic
    const shouldDrawInstead = cardToPlay && activePlayer.hasOnlyWeakCards && activePlayer.hasOnlyWeakCards() && Math.random() < 0.15;
    if (shouldDrawInstead) {
      cardToPlay = null;
    }

    if (!cardToPlay) {
      const drawResult = game.drawCardForPlayer(activePlayer.id);
      if (!drawResult.success) {
        console.warn(`[AI Engine] ${activePlayer.name} draw failed: ${drawResult.reason}`);
        game.advanceTurn(1);
        broadcastGameState(game);
        handleAiTurnCycle(game);
        return;
      }

      broadcastGameState(game);

      if (!drawResult.isPlayable) {
        game.passTurn(activePlayer.id);
        broadcastGameState(game);
        handleAiTurnCycle(game);
        return;
      }

      cardToPlay = drawResult.drawnCard;
    }

    // Secondary action execution delay
    game.aiTimeout = setTimeout(() => {
      game.aiTimeout = null;
      if (!game.isGameStarted) return;

      const verifyPlayer = game.getActivePlayer();
      if (!verifyPlayer || String(verifyPlayer.id) !== String(activePlayer.id)) return;

      const result = executeBotPlay(game, activePlayer, cardToPlay);
      if (!result.success) {
        console.warn(`[AI Engine] ${activePlayer.name} play rejected: ${result.reason}`);
        if (!game.hasDrawnThisTurn) {
          game.drawCardForPlayer(activePlayer.id);
        }
        if (game.canPass) {
          game.passTurn(activePlayer.id);
        } else {
          game.advanceTurn(1);
        }
        broadcastGameState(game);
        handleAiTurnCycle(game);
        return;
      }

      finalizeAiTurn(game);
    }, 600);
  }, thinkingDelay);
}

function executeBotPlay(game, activePlayer, card) {
  if (!card) return { success: false, reason: 'No card available' };

  const isWild = (card.color === 'wild' || card.color === 'wild_draw4');
  const chosenColor = isWild ? activePlayer.chooseBestColor() : null;

  // Bot calls UNO when holding 2 cards before playing down to 1
  if (activePlayer.hand.length === 2) {
    game.callUno(activePlayer.id);
    io.to(game.roomId).emit('uno_called', {
      playerId: activePlayer.id,
      playerName: activePlayer.name,
      message: `📣 Bot ${activePlayer.name} called UNO!`
    });
  }

  return game.playCard(activePlayer.id, card.id, chosenColor);
}

function finalizeAiTurn(game) {
  if (game.winner) {
    broadcastGameState(game);
    settleGameWager(game);
    io.to(game.roomId).emit('game_over', {
      winnerId: game.winner.id,
      matchId: game.matchId,
      wager: { stake: game.stake, playerCount: game.wagerPlayerCount },
      winnerName: game.winner.name,
      message: `🤖 Bot ${game.winner.name} successfully cleared their hand and won the match!`
    });
    return;
  }

  broadcastGameState(game);
  handleAiTurnCycle(game);
}

// Socket Connection Lifecycle
io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  socket.on('wallet_login', ({ walletId, adminMode = false } = {}, acknowledge = () => {}) => {
    try {
      const wallet = walletDatabase.getOrCreate(walletId);
      socket.data.walletId = walletId;
      socket.data.adminMode = adminMode === true && isLocalServerConnection(socket);
      acknowledge({ ok: true, coins: wallet.coins, adminMode: socket.data.adminMode });
    } catch (_) {
      acknowledge({ ok: false, error: 'Could not load the saved coin wallet.' });
    }
  });

  socket.on('shop_purchase', ({ itemId } = {}, acknowledge = () => {}) => {
    const walletId = socket.data.walletId;
    const cost = SHOP_ITEM_COSTS[itemId];
    if (!walletId || !Number.isInteger(cost)) {
      acknowledge({ ok: false, error: 'Unknown shop item.' });
      return;
    }
    const purchase = walletDatabase.purchase(walletId, itemId, cost);
    if (!purchase.ok) {
      acknowledge({ ok: false, error: 'Not enough coins.' });
      return;
    }
    acknowledge({ ok: true, coins: purchase.coins, alreadyOwned: purchase.alreadyOwned });
    socket.emit('wallet_balance', { coins: purchase.coins });
  });

  // Create Room Event
  socket.on('create_room', ({ playerName, mode, stake = 50, targetPlayers = 2 } = {}) => {
    if (!socket.data.walletId) return socket.emit('error_message', 'Wallet is still loading. Please try again.');
    const wager = socket.data.adminMode ? 0 : Number(stake);
    const playerCount = Number(targetPlayers);
    if ((!socket.data.adminMode && (!Number.isInteger(wager) || wager < 50 || wager > 10000)) || ![2, 3, 4].includes(playerCount)) {
      return socket.emit('error_message', 'Choose a stake from 50 to 10,000 coins and 2 to 4 players.');
    }
    if (!socket.data.adminMode && walletDatabase.getBalance(socket.data.walletId) < wager) {
      return socket.emit('error_message', `You need at least ${wager} coins to create this match.`);
    }
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const gameMode = (mode === 'ai') ? 'ai' : 'lan';
    const game = new GameEngine(roomId, gameMode);
    game.stake = wager;
    game.targetPlayers = playerCount;
    game.isAdminTest = Boolean(socket.data.adminMode);

    const safeName = (playerName && playerName.trim()) ? playerName.trim().substring(0, 15) : 'Player 1';
    const hostPlayer = {
      id: socket.id,
      name: safeName,
      isHost: true,
      isBot: false,
      isAdmin: Boolean(socket.data.adminMode),
      walletId: socket.data.walletId,
      hand: []
    };

    game.addPlayer(hostPlayer);

    // Auto-populate 3 smart bots in Solo Vs AI mode
    if (gameMode === 'ai') {
      const bots = [
        new BotPlayer('bot_alice', 'Bot Alice'),
        new BotPlayer('bot_bob', 'Bot Bob'),
        new BotPlayer('bot_charlie', 'Bot Charlie')
      ].slice(0, playerCount - 1);
      bots.forEach(bot => game.addPlayer(bot));
    }

    activeGames.set(roomId, game);
    socket.join(roomId);

    const lobbyPlayers = game.players.map(p => ({
      id: p.id,
      name: p.name,
      isHost: Boolean(p.isHost),
      isBot: Boolean(p.isBot),
      cardCount: p.hand ? p.hand.length : 0,
      handLength: p.hand ? p.hand.length : 0
    }));

    socket.emit('room_created', {
      roomId,
      player: hostPlayer,
      mode: gameMode,
      stake: game.stake,
      targetPlayers: game.targetPlayers,
      players: lobbyPlayers
    });

    console.log(`[Room Created] ID: ${roomId} | Mode: ${gameMode} | Host: ${hostPlayer.name}`);
  });

  // Join Room Event
  socket.on('join_room', ({ roomId, playerName }) => {
    if (!socket.data.walletId) return socket.emit('error_message', 'Wallet is still loading. Please try again.');
    const formattedRoomId = (roomId && typeof roomId === 'string') ? roomId.trim().toUpperCase() : '';
    const game = activeGames.get(formattedRoomId);

    if (!game) {
      return socket.emit('error_message', 'Room not found! Please check your code.');
    }

    if (game.isGameStarted) {
      return socket.emit('error_message', 'Game has already started in this room!');
    }

    if (game.players.length >= game.targetPlayers) {
      return socket.emit('error_message', `Lobby is full! This match is set for ${game.targetPlayers} players.`);
    }

    if (!socket.data.adminMode && walletDatabase.getBalance(socket.data.walletId) < game.stake) {
      return socket.emit('error_message', `This room needs ${game.stake} coins, but your saved balance is too low.`);
    }

    const safeName = (playerName && playerName.trim()) ? playerName.trim().substring(0, 15) : `Player ${game.players.length + 1}`;
    if (socket.data.adminMode && game.stake > 0) {
      game.stake = 0;
      game.isAdminTest = true;
    }

    const joiningPlayer = {
      id: socket.id,
      name: safeName,
      isHost: false,
      isBot: false,
      isAdmin: Boolean(socket.data.adminMode),
      walletId: socket.data.walletId,
      hand: []
    };

    game.addPlayer(joiningPlayer);
    socket.join(formattedRoomId);

    const lobbyPlayers = game.players.map(p => ({
      id: p.id,
      name: p.name,
      isHost: Boolean(p.isHost),
      isBot: Boolean(p.isBot),
      cardCount: p.hand ? p.hand.length : 0,
      handLength: p.hand ? p.hand.length : 0
    }));

    socket.emit('room_created', {
      roomId: formattedRoomId,
      player: joiningPlayer,
      mode: game.mode,
      stake: game.stake,
      targetPlayers: game.targetPlayers,
      players: lobbyPlayers
    });

    io.to(formattedRoomId).emit('player_joined', {
      players: lobbyPlayers,
      roomId: formattedRoomId
    });
    if (game.isAdminTest) {
      io.to(formattedRoomId).emit('room_wager_updated', { stake: 0, targetPlayers: game.targetPlayers });
    }

    console.log(`[Player Joined] ${joiningPlayer.name} joined Room: ${formattedRoomId}`);
  });

  // Start Game Event
  socket.on('start_game', ({ roomId } = {}) => {
    const formattedRoomId = (roomId && typeof roomId === 'string') ? roomId.trim().toUpperCase() : '';
    const game = activeGames.get(formattedRoomId);
    if (!game) return;

    const requester = game.players.find(player => String(player.id) === String(socket.id));
    if (!requester?.isHost) return socket.emit('error_message', 'Only the host can start this match.');
    if (game.isGameStarted && !game.winner) return socket.emit('error_message', 'This match has already started.');
    if (game.players.length !== game.targetPlayers) {
      return socket.emit('error_message', `Waiting for players: ${game.players.length}/${game.targetPlayers}.`);
    }

    const requiredByWallet = new Map();
    const wageredPlayers = game.stake > 0 ? game.players.filter(player => !player.isBot) : [];
    for (const player of wageredPlayers) {
      if (!player.walletId) return socket.emit('error_message', `${player.name}'s wallet is not connected.`);
      requiredByWallet.set(player.walletId, (requiredByWallet.get(player.walletId) || 0) + game.stake);
    }
    for (const [walletId, required] of requiredByWallet) {
      if (walletDatabase.getBalance(walletId) < required) {
        const player = wageredPlayers.find(candidate => candidate.walletId === walletId);
        return socket.emit('error_message', `${player?.name || 'A player'} no longer has enough coins for this stake.`);
      }
    }

    if (game.aiTimeout) {
      clearTimeout(game.aiTimeout);
      game.aiTimeout = null;
    }

    game.matchId = `${formattedRoomId}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    game.wagerPlayerCount = game.players.length;
    game.wagerSettled = false;
    wageredPlayers.forEach(player => {
      const balance = walletDatabase.debit(player.walletId, game.stake);
      io.to(player.id).emit('wallet_balance', { coins: balance });
    });
    game.startGame();

    // Broadcast tailored authoritative states to each connected player
    game.players.forEach(player => {
      if (!player.isBot && player.id) {
        const statePayload = game.getGameState(player.id);
        io.to(player.id).emit('game_started', {
          gameState: statePayload,
          matchId: game.matchId,
          wager: { stake: game.stake, playerCount: game.wagerPlayerCount }
        });
        io.to(player.id).emit('game_state', {
          gameState: statePayload
        });
      }
    });

    console.log(`[Game Started] Room ID: ${formattedRoomId} (Active Players: ${game.players.length})`);
    handleAiTurnCycle(game);
  });

  // Play Card Event
  socket.on('play_card', ({ roomId, cardId, chosenColor, cardIndex }) => {
    const formattedRoomId = (roomId && typeof roomId === 'string') ? roomId.trim().toUpperCase() : '';
    const game = activeGames.get(formattedRoomId);
    if (!game) return;

    const playResult = game.playCard(socket.id, cardId, chosenColor, cardIndex);

    if (playResult && playResult.success) {
      if (game.winner) {
        broadcastGameState(game);
        settleGameWager(game);
        io.to(formattedRoomId).emit('game_over', {
          winnerId: game.winner.id,
          matchId: game.matchId,
          wager: { stake: game.stake, playerCount: game.wagerPlayerCount },
          winnerName: game.winner.name,
          message: `🏆 ${game.winner.name} successfully cleared their hand and won the match!`
        });
        return;
      }

      broadcastGameState(game);
      handleAiTurnCycle(game);
    } else {
      const errorMsg = (playResult && playResult.reason) ? playResult.reason : 'Illegal move! Card must match current color or value.';
      socket.emit('error_message', errorMsg);
      // Resynchronize client immediately on move failure to prevent visual desync
      socket.emit('update_game', {
        gameState: game.getGameState(socket.id)
      });
    }
  });

  // Draw Card Event
  socket.on('draw_card', ({ roomId }) => {
    const formattedRoomId = (roomId && typeof roomId === 'string') ? roomId.trim().toUpperCase() : '';
    const game = activeGames.get(formattedRoomId);
    if (!game) return;

    const drawResult = game.drawCardForPlayer(socket.id);
    if (!drawResult.success) {
      socket.emit('error_message', drawResult.reason || 'Cannot draw card right now.');
      socket.emit('update_game', {
        gameState: game.getGameState(socket.id)
      });
      return;
    }

    broadcastGameState(game);
  });

  // Pass Turn Event
  socket.on('pass_turn', ({ roomId }) => {
    const formattedRoomId = (roomId && typeof roomId === 'string') ? roomId.trim().toUpperCase() : '';
    const game = activeGames.get(formattedRoomId);
    if (!game) return;

    const success = game.passTurn(socket.id);
    if (success) {
      broadcastGameState(game);
      handleAiTurnCycle(game);
    } else {
      socket.emit('error_message', 'You cannot pass right now.');
      socket.emit('update_game', {
        gameState: game.getGameState(socket.id)
      });
    }
  });

  // Call UNO Event
  socket.on('call_uno', ({ roomId }) => {
    const formattedRoomId = (roomId && typeof roomId === 'string') ? roomId.trim().toUpperCase() : '';
    const game = activeGames.get(formattedRoomId);
    if (!game) return;

    game.callUno(socket.id);
    const caller = game.players.find(p => String(p.id) === String(socket.id));
    const callerName = caller ? caller.name : 'A player';

    io.to(formattedRoomId).emit('uno_called', {
      playerId: socket.id,
      playerName: callerName,
      message: `📣 ${callerName} called UNO!`
    });

    console.log(`[UNO Call] ${callerName} in Room ${formattedRoomId}`);
  });

  // Leave Room Event
  socket.on('leave_room', ({ roomId }) => {
    const formattedRoomId = (roomId && typeof roomId === 'string') ? roomId.trim().toUpperCase() : '';
    const game = activeGames.get(formattedRoomId);
    if (game) {
      game.removePlayer(socket.id);
      socket.leave(formattedRoomId);

      io.to(formattedRoomId).emit('player_left', {
        players: game.players.map(p => ({
          id: p.id,
          name: p.name,
          isHost: Boolean(p.isHost),
          isBot: Boolean(p.isBot)
        })),
        roomId: formattedRoomId
      });

      if (game.isGameStarted && game.players.length > 0) {
        broadcastGameState(game);
        handleAiTurnCycle(game);
      }

      if (game.players.length === 0 || game.players.every(p => p.isBot)) {
        if (game.aiTimeout) {
          clearTimeout(game.aiTimeout);
          game.aiTimeout = null;
        }
        activeGames.delete(formattedRoomId);
        console.log(`[Room Deleted] Room ID: ${formattedRoomId} closed.`);
      }
    }
  });

  // Disconnect Handler
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ${socket.id}`);
    activeGames.forEach((game, roomId) => {
      const playerIndex = game.players.findIndex(p => String(p.id) === String(socket.id));
      if (playerIndex !== -1) {
        game.removePlayer(socket.id);
        io.to(roomId).emit('player_left', {
          players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isHost: Boolean(p.isHost),
            isBot: Boolean(p.isBot)
          }))
        });

        if (game.isGameStarted && game.players.length > 0) {
          broadcastGameState(game);
          handleAiTurnCycle(game);
        }

        if (game.players.length === 0 || game.players.every(p => p.isBot)) {
          if (game.aiTimeout) {
            clearTimeout(game.aiTimeout);
            game.aiTimeout = null;
          }
          activeGames.delete(roomId);
          console.log(`[Room Cleaned] Room ID: ${roomId} cleaned up.`);
        }
      }
    });
  });
});

// Start Server & Announce Network Addresses
server.listen(PORT, () => {
  const localIps = getLocalIpAddresses();

  console.log('\n==================================================');
  console.log('🎮 Authoritative UNO Game Server Active!');
  console.log('==================================================');
  console.log(`📌 Local Access : http://localhost:${PORT}`);

  if (localIps.length > 0) {
    console.log('\n🌐 LAN Network Access for Friends (On Same Wi-Fi):');
    localIps.forEach(net => {
      console.log(`   👉 [${net.interface}] http://${net.ip}:${PORT}`);
    });
    console.log('\n📱 Open the address above on any device on the network to play!');
  } else {
    console.log('\n⚠️ No active Local Area Network (Wi-Fi/LAN) IP detected.');
  }
  console.log('==================================================\n');
});
