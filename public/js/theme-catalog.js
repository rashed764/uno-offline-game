(function (root) {
  'use strict';

  // Add future shop cosmetics here so the browser and server share one catalog.
  const catalog = {
    decks: [
      { id: 'classic', name: 'Classic UNO', cost: 0, theme: { surface: '#172323', panel: '#c8092a', emblem: '#f2cf25' } },
      { id: 'cyberpunk', name: 'Cyber Punk', cost: 250, theme: { surface: '#111329', panel: '#b20aff', emblem: '#4ffcff' } },
      { id: 'retro-neon', name: 'Retro Neon', cost: 200, theme: { surface: '#102823', panel: '#f04420', emblem: '#ffe34d' } },
      { id: 'dark', name: 'Minimalist Dark', cost: 175, theme: { surface: '#111318', panel: '#333944', emblem: '#f4f5f8' } }
    ],
    tables: [
      { id: 'felt-green', name: 'Felt Green', cost: 0, theme: { surface: 'radial-gradient(ellipse at center, #1b351e 0%, #0d1b10 100%)', frame: '#2e1d0c' } },
      { id: 'wood', name: 'Wooden Table', cost: 150, theme: { surface: 'repeating-linear-gradient(8deg, #58371f 0 16px, #70482a 17px 32px, #4b2f1d 33px 36px)', frame: '#24140d' } },
      { id: 'galaxy', name: 'Galaxy', cost: 250, theme: { surface: 'radial-gradient(ellipse at 28% 30%, #493176, #171739 48%, #080d20 100%)', frame: '#17122b' } },
      { id: 'sci-fi', name: 'Sci-Fi Grid', cost: 200, theme: { surface: 'linear-gradient(rgba(28,210,225,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(28,210,225,.12) 1px, transparent 1px), radial-gradient(ellipse, #153b50, #091a2a)', frame: '#102b40' } }
    ]
  };

  root.UnoThemeCatalog = catalog;
  if (typeof module !== 'undefined' && module.exports) module.exports = catalog;
})(typeof window === 'undefined' ? globalThis : window);
