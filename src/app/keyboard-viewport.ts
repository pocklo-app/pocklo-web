export function trackKeyboardViewport(): void {
  const viewport = window.visualViewport;
  if (!viewport) return;

  let frame = 0;
  const sync = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const field = document.activeElement;
      const editing = field instanceof HTMLElement &&
        field.matches('input, textarea, [contenteditable]:not([contenteditable="false"])');
      const shrinkage = window.innerHeight - viewport.height;
      // A pinch zoom or a collapsing browser toolbar is not a keyboard.
      const inset = editing && viewport.scale === 1 && shrinkage > 80 ? Math.round(shrinkage) : 0;
      document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`);
      if (!inset) return;

      const fieldRect = field.getBoundingClientRect();
      const top = viewport.offsetTop + 12;
      const bottom = viewport.offsetTop + viewport.height - 12;
      if (fieldRect.bottom > bottom && fieldRect.top > top) {
        window.scrollBy({ top: fieldRect.bottom - bottom, behavior: 'instant' });
      } else if (fieldRect.top < top) {
        window.scrollBy({ top: fieldRect.top - top, behavior: 'instant' });
      }
    });
  };

  viewport.addEventListener('resize', sync);
  document.addEventListener('focusin', sync);
  document.addEventListener('focusout', sync);
}
