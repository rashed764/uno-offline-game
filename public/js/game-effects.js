/* Presentation helpers: the server remains authoritative for timer expiry and moves. */
(function (root) {
  'use strict';
  function animateCard(element, destination, duration = 420) {
    if (!element || !element.getBoundingClientRect || !destination) return Promise.resolve();
    const from = element.getBoundingClientRect();
    const to = destination.getBoundingClientRect();
    const animation = element.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(.72)`, opacity: .35 }
    ], { duration, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' });
    return animation.finished.catch(() => {});
  }

  // Call with a server deadline (epoch ms), not a locally restarted duration.
  function bindTurnTimer(bar, deadline, onExpire, durationMs = 20000) {
    let raf = 0, fired = false;
    const end = Number(deadline);
    const tick = () => {
      const remaining = Math.max(0, end - Date.now());
      const ratio = Math.min(1, remaining / durationMs);
      if (bar) {
        bar.style.transform = `scaleX(${ratio})`;
        bar.setAttribute('aria-valuenow', String(Math.ceil(remaining / 1000)));
      }
      if (!remaining) { if (!fired) { fired = true; if (onExpire) onExpire(); } return; }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }

  function playPowerEffect(card, kind) {
    if (!card || !card.animate) return;
    const keyframes = kind === 'draw2' || kind === 'wild_draw4'
      ? [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-18px) scale(1.08)' }, { transform: 'translateY(0) scale(1)' }]
      : kind === 'reverse'
        ? [{ transform: 'rotate(0)' }, { transform: 'rotate(180deg)' }]
        : [{ filter: 'brightness(1)' }, { filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }];
    card.animate(keyframes, { duration: 500, easing: 'ease-out' });
  }
  root.UnoEffects = Object.freeze({ animateCard, bindTurnTimer, playPowerEffect });
})(window);
