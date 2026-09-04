// Instant tooltip for any element with a data-tip attribute. Native title
// tooltips have a fixed ~1s delay that cannot be changed.
export function initTooltip() {
  const tip = document.createElement('div');
  tip.id = 'tooltip';
  tip.hidden = true;
  document.body.appendChild(tip);

  function show(target) {
    tip.textContent = target.dataset.tip;
    tip.hidden = false;
    const r = target.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const gap = 6;
    // Default above the element; data-tip-below places it underneath.
    // Flip when the preferred side would leave the viewport.
    let top = target.dataset.tipBelow !== undefined ? r.bottom + gap : r.top - t.height - gap;
    if (top < 0) top = r.bottom + gap;
    else if (top + t.height > window.innerHeight) top = r.top - t.height - gap;
    let left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(gap, Math.min(left, window.innerWidth - t.width - gap));
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  }

  function hide() {
    tip.hidden = true;
  }

  for (const [enter, leave] of [['mouseover', 'mouseout'], ['focusin', 'focusout']]) {
    document.addEventListener(enter, e => {
      const target = e.target.closest?.('[data-tip]');
      if (target) show(target);
    });
    document.addEventListener(leave, e => {
      if (e.target.closest?.('[data-tip]')) hide();
    });
  }
  document.addEventListener('scroll', hide, true);
}
