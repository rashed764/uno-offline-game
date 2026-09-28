# UNO project blueprint and implementation guide

This repository is already a working browser game foundation: `server.js` hosts Express and Socket.io, `src/game/GameEngine.js` owns the authoritative rules and per-player state, `src/game/BotPlayer.js` chooses AI moves, and `public/js/game.js` renders the table and runs the client interactions. The additions in `public/js/economy.js` and `public/js/game-effects.js` provide persistence and presentation helpers.

## Recommended stack and architecture

- **UI:** existing HTML/CSS/JavaScript plus CSS transforms and the Web Animations API. This is a good fit for a 2D card table; Three.js would add complexity without improving card readability. Animate `transform` and `opacity`, avoid layout-triggering properties, and honor `prefers-reduced-motion`.
- **Realtime:** Node.js, Express, Socket.io over WebSocket with polling fallback. On a home LAN, one host runs the server and other devices open its LAN address.
- **Authority:** the server owns deck order, hands, current turn, timer deadline, legal moves, UNO penalties, and rewards. Clients send intents (`play_card`, `draw_card`) and receive their private hand plus public opponent counts. Never accept a client-submitted game state.
- **Persistence:** browser LocalStorage is suitable for cosmetic preferences and casual local coins. LAN competitive rewards require server-side persistence and match IDs; LocalStorage is user-editable and cannot prevent cheating.

```text
Browser UI + animations
  ├─ Socket.IO client ── intents ──> Express / Socket.IO host
  ├─ UnoEconomy (local cosmetics and casual wallet)
  └─ GameEngine (rendered state only)
                         ├─ GameEngine: authoritative rules
                         ├─ BotPlayer: AI turn policy
                         └─ room registry: socket/player/room mapping
```

The existing `getGameState(playerId)` currently includes all players' hands. Before exposing this game to untrusted LAN clients, change the public `players` entries to `{id,name,cardCount,isBot,isHost}` and expose card objects only in `myHand`. Emit a tailored state to each socket. The server already emits player-targeted snapshots; this is a small but important privacy fix.

## Roadmap

1. **Stabilize rules:** define the exact ruleset (including whether stacking is enabled), test deck counts, legal moves, wild-draw-four policy, draw/pass behavior, UNO call window, and two-player reverse/skip behavior.
2. **Make the server authoritative:** hide opponents' hands; validate every Socket.IO payload, room membership, active turn, card ownership, chosen color, and game phase. Add per-socket rate limits and reconnect handling.
3. **Build a clear state contract:** include `roomId`, monotonically increasing `revision`, `turnDeadline`, `currentPlayerId`, public player counts, top card/current color, and private `myHand`. Make room snapshots recoverable after reconnect.
4. **Add turn deadlines:** server starts a deadline when a turn begins, broadcasts it, and uses a server timeout to auto-draw/pass. Cancel/re-arm on every state transition. The client timer is only a visual countdown.
5. **Polish interaction:** animate shuffled deck/dealing and draw/play transitions with Web Animations API; sequence movement from deck to hand/discard; add action-specific effects and reduced-motion support. Keep one animation per frame and avoid animating box-shadow/position.
6. **Add progression/shop:** use `UnoEconomy` for offline play. For LAN match rewards, have the server issue a unique match ID and award once on its own match result; persist the wallet on the host/database if rewards must follow players across devices.
7. **Tune AI:** configurable profiles can change response delay and heuristic weights (conserve wilds, choose the color most held, target a player near UNO). Keep the selected profile in room configuration.
8. **Ship:** run the host on the LAN interface, display the discovered LAN URL, document firewall access to the selected port, and add reconnect/host-disconnect behavior.

## Baseline code and how to use it

### Deck, shuffle, and dealing

`GameEngine.generateDeck()` creates the 108-card classic deck (76 number, 24 action, 8 wild). `shuffleDeck()` uses Fisher-Yates; `startGame()` shuffles, deals seven to each player, then selects a numeric opening card. `drawCards()` reshuffles the discard pile while preserving its top card. The client already has dealing/fan animation sequencing in `public/js/game.js`; keep visual delays on the client and do not delay or duplicate authoritative server dealing.

Minimal reusable Fisher-Yates implementation:

```js
function shuffle(deck, random = Math.random) {
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
```

Use the engine as `game.startGame()` after players join. The server should publish a game-start event and snapshots; each browser animates the dealt cards into positions from that snapshot.

### Turns, timer, and bot policy

`GameEngine` provides `playCard`, `drawCardForPlayer`, `passTurn`, `advanceTurn`, and `getActivePlayer`. `BotPlayer.chooseCardToPlay` is the policy seam for difficulty settings. Add a per-game `turnDeadline` and timer handle in the server. A timer handler should re-check the game and active player before applying a move, since stale timeouts can fire after a fast move:

```js
function armTurnTimer(game, io, seconds = 20) {
  clearTimeout(game.turnTimeout);
  const playerId = String(game.getActivePlayer()?.id);
  game.turnDeadline = Date.now() + seconds * 1000;
  io.to(game.roomId).emit('turn_deadline', { playerId, deadline: game.turnDeadline });
  game.turnTimeout = setTimeout(() => {
    if (!game.isGameStarted || String(game.getActivePlayer()?.id) !== playerId) return;
    const result = game.drawCardForPlayer(playerId);
    if (result.success) game.passTurn(playerId);
    // Broadcast the tailored state and arm the next turn after this transition.
  }, seconds * 1000);
}
```

Call `armTurnTimer` after game start and after every accepted move/pass/timeout. On the client, `UnoEffects.bindTurnTimer(bar, deadline, onExpire)` draws a smooth visual countdown; `onExpire` must not make a move (the server timer does that). It currently uses a 20-second visual scale; pass matching duration or update its optional duration argument if the server uses another limit.

### Socket.IO room events

The current server already handles `create_room`, `join_room`, `start_game` and game actions, then sends `update_game` / `game_state` snapshots. Keep commands small and validate them on the server. A typical event contract is:

```js
// Client -> server (existing names are retained by this project)
socket.emit('create_room', { playerName, mode: 'lan' });
socket.emit('join_room', { roomId, playerName });
socket.emit('play_card', { roomId, cardId, chosenColor });
socket.emit('draw_card', { roomId });
socket.emit('call_uno', { roomId });

// Server -> client: one personalized snapshot per player
io.to(player.socketId).emit('game_state', {
  revision: game.revision,
  gameState: game.getGameState(player.id)
});
```

The exact play/draw event names should follow the handlers already registered in `server.js`. A socket ID is transport identity, not durable player identity; map it to an authenticated room player and reject commands for other rooms. Add an increasing revision to snapshots so the UI can ignore stale messages.

### Economy and theme selection

`public/js/economy.js` is loaded before `game.js` and exposes `window.UnoEconomy`:

```js
const profile = UnoEconomy.getProfile();
UnoEconomy.earnCoins(25, 'match-unique-id'); // repeated match ID is idempotent
const purchase = UnoEconomy.purchase('decks', 'cyberpunk');
if (purchase.ok) UnoEconomy.select('decks', 'cyberpunk');
UnoEconomy.select('tables', 'galaxy');
```

Apply `profile.selected.deck` and `.table` as theme class names or CSS custom properties on the table root. Render `UnoEconomy.catalog` into a shop UI, showing price, owned state, and selected state. `earnCoins` is appropriate for local bot games only; do not use a browser claim to pay LAN winners. Move competitive rewards behind server match completion and persistent storage.

### Animation helpers

`public/js/game-effects.js` exposes `UnoEffects.animateCard(element, destination)`, `playPowerEffect(cardElement, 'draw2'|'wild_draw4'|'skip'|'reverse')`, and `bindTurnTimer(progressElement, deadline)`. These are DOM-level primitives: call them from the existing UI after a server snapshot arrives, and use stable card IDs to find elements. Animate clones/temporary elements if the real card must remain in its hand slot until the move is confirmed.

## Performance and operational notes

- For a small LAN room, one Node process and Socket.io rooms are enough. Use `socket.join(roomId)` and room-targeted public events; keep private hand snapshots addressed to a single socket.
- Use CSS `transform`/`opacity`, requestAnimationFrame or Web Animations API, and avoid repeatedly measuring layout during animation. Cache element bounds before starting transitions.
- LAN mode needs host firewall permission for the server port and devices on the same network. Do not enable unrestricted internet CORS/deployment assumptions for a LAN-only game.
- `localStorage` is per browser profile and can be cleared or edited. For a shared cross-device account, use a database and authenticated server-side wallet instead.
