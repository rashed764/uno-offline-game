/**
 * Authoritative UNO Game Engine
 * Implements standard official UNO rules, strict state synchronization schema,
 * and robust server-side game loop validation.
 */
'use strict';

const CARD_COLORS = ['red', 'blue', 'green', 'yellow'];
const SPECIAL_CARDS = ['skip', 'reverse', 'draw2'];

class GameEngine {
  constructor(roomId, mode = 'lan') {
    this.roomId = roomId;
    this.mode = mode; // 'lan' or 'ai'
    this.players = [];
    this.deck = [];
    this.discardPile = [];
    this.currentTurnIndex = 0;
    this.direction = 1; // 1: clockwise, -1: counter-clockwise
    this.currentColor = null;
    this.currentValue = null;
    this.isGameStarted = false;
    this.winner = null;
    this.unoCalledPlayers = new Set();
    this.hasDrawnThisTurn = false;
    this.lastDrawnCardId = null;
    this.lastPlayedCard = null;
    this.drawEventSequence = 0;
    this.lastDrawEvent = null;
    this.canPass = false;
  }

  /**
   * Generates a standard 108-card official UNO deck
   */
  generateDeck() {
    const deck = [];
    let cardSeq = 0;

    const addCard = (color, value, type) => {
      cardSeq += 1;
      deck.push({
        id: `card_${cardSeq}`,
        color: String(color),
        value: String(value),
        type: String(type)
      });
    };

    CARD_COLORS.forEach(color => {
      // Exactly one '0' card per color
      addCard(color, '0', 'number');

      // Two cards each for numbers 1 to 9
      for (let i = 1; i <= 9; i++) {
        addCard(color, `${i}`, 'number');
        addCard(color, `${i}`, 'number');
      }

      // Two cards each for action cards (Skip, Reverse, Draw 2)
      SPECIAL_CARDS.forEach(action => {
        addCard(color, action, 'action');
        addCard(color, action, 'action');
      });
    });

    // 4 Wild cards & 4 Wild Draw 4 cards
    for (let i = 1; i <= 4; i++) {
      addCard('wild', 'wild', 'wild');
      addCard('wild', 'wild_draw4', 'wild');
    }

    return deck;
  }

  /**
   * Fisher-Yates multi-pass shuffle
   */
  shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let pass = 0; pass < 3; pass++) {
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
    }
    return shuffled;
  }

  /**
   * Starts a brand new game match and deals 7 cards to all registered players
   */
  startGame() {
    this.deck = this.shuffleDeck(this.generateDeck());
    this.discardPile = [];
    this.direction = 1;
    this.currentTurnIndex = 0;
    this.winner = null;
    this.unoCalledPlayers.clear();
    this.hasDrawnThisTurn = false;
    this.lastDrawnCardId = null;
    this.lastPlayedCard = null;
    this.drawEventSequence = 0;
    this.lastDrawEvent = null;
    this.canPass = false;
    this.isGameStarted = true;

    // Reset hands for all players
    this.players.forEach(p => {
      p.hand = [];
    });

    // Distribute 7 cards to each player
    this.players.forEach(p => {
      p.hand = this.drawCards(7);
    });

    // Draw starting card for discard pile (must be a standard number card 0-9)
    let topCard = this.deck.pop();
    let attempts = 0;
    while (topCard && (topCard.color === 'wild' || topCard.type !== 'number') && attempts < 100) {
      this.deck.unshift(topCard);
      topCard = this.deck.pop();
      attempts++;
    }

    if (!topCard || topCard.color === 'wild' || topCard.type !== 'number') {
      topCard = { id: 'fallback_card_red_0', color: 'red', value: '0', type: 'number' };
    }

    this.discardPile.push(topCard);
    this.currentColor = topCard.color;
    this.currentValue = topCard.value;

    // Strict Architectural Integrity: Guarantee every player has exactly 7 valid cards
    this.players.forEach(p => {
      if (!Array.isArray(p.hand) || p.hand.length !== 7) {
        console.warn(`[GameEngine] Redealing cards to player ${p.id} (${p.name}) to ensure contract compliance.`);
        p.hand = this.drawCards(7);
      }
    });

    return true;
  }

  /**
   * Draws a specified count of cards from deck, reshuffling discard pile if needed
   */
  drawCards(count) {
    const drawn = [];
    let attempts = 0;
    const maxAttempts = Math.max(count * 5, 50);

    while (drawn.length < count && attempts < maxAttempts) {
      attempts++;
      if (this.deck.length === 0) {
        this.reshuffleDiscardIntoDeck();
      }
      if (this.deck.length > 0) {
        drawn.push(this.deck.pop());
      } else {
        break;
      }
    }
    return drawn;
  }

  /**
   * Reshuffles discard pile back into deck when draw pile runs low
   */
  reshuffleDiscardIntoDeck() {
    if (this.discardPile.length <= 1) return;
    const topCard = this.discardPile.pop();
    this.deck = this.shuffleDeck([...this.discardPile]);
    this.discardPile = [topCard];
  }

  /**
   * Checks if a card is legally playable against current color or value
   */
  canPlayCard(card) {
    if (!card) return false;
    if (card.color === 'wild' || card.value === 'wild' || card.value === 'wild_draw4') {
      return true;
    }
    return card.color === this.currentColor || String(card.value) === String(this.currentValue);
  }

  /**
   * Plays a card from a player's hand with full validation and state updates
   */
  playCard(playerId, cardId, chosenColor = null, cardIndex = null) {
    if (!this.isGameStarted) {
      return { success: false, reason: 'Game has not started yet.' };
    }

    const player = this.players.find(p => String(p.id) === String(playerId));
    if (!player) {
      return { success: false, reason: 'Player not found in this game.' };
    }

    const activePlayer = this.getActivePlayer();
    if (!activePlayer || String(activePlayer.id) !== String(playerId)) {
      return { success: false, reason: 'It is not your turn!' };
    }

    let index = -1;
    const parsedIndex = Number(cardIndex);

    // Fast-path lookup by validated index
    if (Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < player.hand.length) {
      if (cardId == null || String(player.hand[parsedIndex].id) === String(cardId)) {
        index = parsedIndex;
      }
    }

    // Fallback lookup by card ID
    if (index === -1 && cardId != null) {
      index = player.hand.findIndex(c => String(c.id) === String(cardId));
    }

    if (index === -1) {
      return { success: false, reason: 'Card not found in your hand.' };
    }

    const card = player.hand[index];
    this.lastPlayedCard = {
      playerId: String(playerId),
      handIndex: index,
      cardId: String(card.id)
    };

    // Wild color validation
    const isWildCard = (card.color === 'wild' || card.value === 'wild' || card.value === 'wild_draw4');
    if (isWildCard && (!chosenColor || !CARD_COLORS.includes(chosenColor))) {
      return { success: false, reason: 'Please choose a valid color (red, blue, green, yellow).' };
    }

    // Move legality check
    if (!this.canPlayCard(card)) {
      return {
        success: false,
        reason: `Illegal card! Card must match current color (${(this.currentColor || '').toUpperCase()}) or value (${this.currentValue}).`
      };
    }

    // Execute card play: remove from hand and add to discard pile
    player.hand.splice(index, 1);
    this.discardPile.push(card);

    // Update table color & value
    this.currentColor = isWildCard ? chosenColor : card.color;
    this.currentValue = card.value;
    this.hasDrawnThisTurn = false;
    this.lastDrawnCardId = null;
    this.canPass = false;

    // UNO penalty check: Forgot to call UNO when 1 card remains
    if (player.hand.length === 1 && !this.unoCalledPlayers.has(String(playerId))) {
      player.hand.push(...this.drawCards(2));
    }

    // Reset UNO call status if player now has more than 1 card
    if (player.hand.length > 1) {
      this.unoCalledPlayers.delete(String(playerId));
    }

    // Win check
    if (player.hand.length === 0) {
      this.winner = player;
      this.isGameStarted = false;
      return { success: true, winner: player };
    }

    // Process action cards & advance turns
    this.executeCardAction(card);
    return { success: true };
  }

  /**
   * Executes special card behaviors (Skip, Reverse, Draw 2, Wild Draw 4)
   */
  executeCardAction(card) {
    let skipCount = 1;

    if (card.value === 'skip') {
      skipCount = 2;
    } else if (card.value === 'reverse') {
      if (this.players.length === 2) {
        skipCount = 2; // In 2-player UNO, Reverse acts as a Skip
      } else {
        this.direction *= -1;
        skipCount = 1;
      }
    } else if (card.value === 'draw2') {
      const nextPlayerIndex = this.getNextPlayerIndex(1);
      this.players[nextPlayerIndex].hand.push(...this.drawCards(2));
      skipCount = 2; // Affected player's turn is skipped
    } else if (card.value === 'wild_draw4') {
      const nextPlayerIndex = this.getNextPlayerIndex(1);
      this.players[nextPlayerIndex].hand.push(...this.drawCards(4));
      skipCount = 2; // Affected player's turn is skipped
    }

    this.advanceTurn(skipCount);
  }

  /**
   * Advances the turn counter by a specified step count
   */
  advanceTurn(steps = 1) {
    this.currentTurnIndex = this.getNextPlayerIndex(steps);
    this.hasDrawnThisTurn = false;
    this.lastDrawnCardId = null;
    this.canPass = false;
  }

  /**
   * Computes the target player index following direction rules
   */
  getNextPlayerIndex(steps = 1) {
    if (!this.players || this.players.length === 0) return 0;
    let idx = this.currentTurnIndex;
    for (let i = 0; i < steps; i++) {
      idx = (idx + this.direction + this.players.length) % this.players.length;
    }
    return idx;
  }

  /**
   * Draws a card from deck for the active player during their turn
   */
  drawCardForPlayer(playerId) {
    if (!this.isGameStarted) {
      return { success: false, drawnCard: null, isPlayable: false, reason: 'Game has not started yet.' };
    }

    const player = this.players.find(p => String(p.id) === String(playerId));
    if (!player) {
      return { success: false, drawnCard: null, isPlayable: false, reason: 'Player not found.' };
    }

    const activePlayer = this.getActivePlayer();
    if (!activePlayer || String(activePlayer.id) !== String(playerId)) {
      return { success: false, drawnCard: null, isPlayable: false, reason: 'Wait for your turn to draw!' };
    }

    if (this.hasDrawnThisTurn) {
      return { success: false, drawnCard: null, isPlayable: false, reason: 'You have already drawn this turn.' };
    }

    const drawn = this.drawCards(1);
    if (drawn.length === 0) {
      return { success: false, drawnCard: null, isPlayable: false, reason: 'Draw pile is exhausted.' };
    }

    const drawnCard = drawn[0];
    const handIndex = player.hand.length;
    player.hand.push(drawnCard);
    this.lastDrawEvent = {
      eventId: ++this.drawEventSequence,
      playerId: String(playerId),
      handIndex
    };

    // If player had 1 card and drew, clear UNO status
    if (player.hand.length > 1) {
      this.unoCalledPlayers.delete(String(playerId));
    }

    const isPlayable = this.canPlayCard(drawnCard);

    this.hasDrawnThisTurn = true;
    this.lastDrawnCardId = drawnCard.id;
    this.canPass = true;

    return { success: true, drawnCard, isPlayable };
  }

  playerDrawCard(playerId) {
    return this.drawCardForPlayer(playerId);
  }

  /**
   * Passes the player's turn after having drawn a card
   */
  passTurn(playerId) {
    if (!this.isGameStarted) return false;

    const player = this.players.find(p => String(p.id) === String(playerId));
    if (!player) return false;

    const activePlayer = this.getActivePlayer();
    if (!activePlayer || String(activePlayer.id) !== String(playerId)) return false;
    if (!this.canPass) return false;

    this.lastDrawnCardId = null;
    this.canPass = false;
    this.advanceTurn(1);
    return true;
  }

  /**
   * Registers a UNO call for a player
   */
  callUno(playerId) {
    const player = this.players.find(p => String(p.id) === String(playerId));
    if (!player) return;
    this.unoCalledPlayers.add(String(playerId));
  }

  /**
   * Returns the player whose turn it currently is
   */
  getActivePlayer() {
    if (!this.players || this.players.length === 0) return null;
    this.currentTurnIndex = (this.currentTurnIndex % this.players.length + this.players.length) % this.players.length;
    return this.players[this.currentTurnIndex];
  }

  /**
   * Adds a player to the room lobby
   */
  addPlayer(player) {
    if (!player) return;
    if (!Array.isArray(player.hand)) {
      player.hand = [];
    }
    this.players.push(player);
  }

  /**
   * Removes a player on disconnect or leave
   */
  removePlayer(playerId) {
    const originalTurnId = this.players[this.currentTurnIndex]?.id;
    this.players = this.players.filter(p => String(p.id) !== String(playerId));

    if (this.players.length === 0) {
      this.currentTurnIndex = 0;
      return;
    }

    if (originalTurnId) {
      const newIndex = this.players.findIndex(p => String(p.id) === String(originalTurnId));
      this.currentTurnIndex = (newIndex !== -1) ? newIndex : (this.currentTurnIndex % this.players.length);
    } else {
      this.currentTurnIndex = this.currentTurnIndex % this.players.length;
    }
    this.currentTurnIndex = (this.currentTurnIndex % this.players.length + this.players.length) % this.players.length;
  }

  /**
   * Strictly Defined GameState Schema
   * Conforms 100% to Client-Server Architectural Contract
   */
  getGameState(playerId) {
    const activePlayer = this.getActivePlayer();
    const isMyTurn = Boolean(activePlayer && String(activePlayer.id) === String(playerId));
    const targetPlayer = this.players.find(p => String(p.id) === String(playerId));

    const topCard = (this.discardPile && this.discardPile.length > 0)
      ? this.discardPile[this.discardPile.length - 1]
      : null;

    // myHand MUST always be an array containing the target player's actual card objects
    const myHand = (targetPlayer && Array.isArray(targetPlayer.hand))
      ? [...targetPlayer.hand]
      : [];

    return {
      currentTurnPlayerName: activePlayer ? String(activePlayer.name) : '---',
      currentTurnPlayerId: activePlayer ? String(activePlayer.id) : null,
      currentColor: this.currentColor || (topCard ? topCard.color : null),
      currentValue: this.currentValue || (topCard ? topCard.value : null),
      direction: typeof this.direction === 'number' ? this.direction : 1,
      topCard: topCard,
      myHand: myHand,
      players: this.players.map(p => {
        const count = (p.hand && Array.isArray(p.hand)) ? p.hand.length : 0;
        return {
          id: String(p.id),
          name: String(p.name),
          cardCount: count,
          handLength: count,
          // Opponent card identities are private; only myHand is sent above.
          hand: String(p.id) === String(playerId) && Array.isArray(p.hand) ? [...p.hand] : [],
          isBot: Boolean(p.isBot),
          isHost: Boolean(p.isHost)
        };
      }),
      // Reactive UI helper state variables
      isMyTurn: isMyTurn,
      hasDrawnThisTurn: Boolean(this.hasDrawnThisTurn && isMyTurn),
      canDraw: Boolean(this.isGameStarted && isMyTurn && !this.hasDrawnThisTurn),
      lastDrawnCardId: isMyTurn ? this.lastDrawnCardId : null,
      lastPlayedCard: this.lastPlayedCard ? { ...this.lastPlayedCard } : null,
      lastDrawEvent: this.lastDrawEvent ? { ...this.lastDrawEvent } : null,
      canPass: Boolean(this.canPass && isMyTurn),
      isGameStarted: Boolean(this.isGameStarted),
      winner: this.winner ? { id: String(this.winner.id), name: String(this.winner.name) } : null
    };
  }
}

module.exports = GameEngine;
