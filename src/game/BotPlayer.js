/**
 * Computer AI Bot Logic for Offline / Vs Computer Mode
 */
class BotPlayer {
  constructor(id, name = 'AI Bot') {
    this.id = id;
    this.name = name;
    this.isBot = true;
    this.hand = [];
  }

  /**
   * Decide which card to play based on top card & current chosen color
   */
  chooseCardToPlay(topCard, currentColor) {
    // Find valid playable cards
    const playableCards = this.hand.filter(card => {
      if (card.color === 'wild' || card.color === 'wild_draw4') return true;
      if (card.color === currentColor) return true;
      if (card.value === topCard.value) return true;
      return false;
    });

    if (playableCards.length === 0) {
      return null; // Must draw a card
    }

    // Advanced Priority heuristic:
    // 1. Prioritize blocking actions (Draw 2, Skip, Reverse)
    // 2. Prioritize high number cards (9, 8, 7...) to reduce points/risk
    // 3. Keep Wild cards for emergencies (unless nothing else is playable)
    
    playableCards.sort((a, b) => {
      const getPriority = (card) => {
        if (card.value === 'draw2' || card.value === 'skip' || card.value === 'reverse') return 1;
        if (!isNaN(card.value)) return 2; // Numbers
        if (card.color === 'wild' || card.color === 'wild_draw4') return 3;
        return 4;
      };

      const pA = getPriority(a);
      const pB = getPriority(b);

      if (pA !== pB) return pA - pB;

      // If both are numbers, pick the higher one
      if (pA === 2 && !isNaN(a.value) && !isNaN(b.value)) {
        return parseInt(b.value) - parseInt(a.value);
      }

      return 0;
    });

    return playableCards[0];
  }

  /**
   * Check if the bot only has "weak" cards (numbers)
   */
  hasOnlyWeakCards() {
    return this.hand.every(card => !isNaN(card.value));
  }

  /**
   * Choose color when playing a Wild card based on most frequent color in hand
   */
  chooseBestColor() {
    const colorCounts = { red: 0, blue: 0, green: 0, yellow: 0 };
    this.hand.forEach(card => {
      if (colorCounts[card.color] !== undefined) {
        colorCounts[card.color]++;
      }
    });

    let bestColor = 'red';
    let maxCount = -1;

    for (const [color, count] of Object.entries(colorCounts)) {
      if (count > maxCount) {
        maxCount = count;
        bestColor = color;
      }
    }

    return bestColor;
  }
}

module.exports = BotPlayer;
