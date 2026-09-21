import { useEffect } from "react";

export function useHorizontalScroll(ref, deps = [], speedMultiplier = 1) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleWheel = (e) => {
      if (e.deltaY === 0) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return; // Bypass if holding modifiers (Ctrl, Cmd, Shift)

      // If hovering over the empty void (e.target is exactly the container) or to the right of the last child, bypass
      if (e.target === el) {
        return;
      }
      const lastChild = el.lastElementChild;
      if (lastChild && e.clientX > lastChild.getBoundingClientRect().right) {
        return;
      }

      const isScrollingRight = e.deltaY > 0;
      const isAtLeftEdge = el.scrollLeft <= 0;
      // Use a small 2px buffer for floating point rounding issues
      const isAtRightEdge = Math.ceil(el.scrollLeft + el.clientWidth) >= el.scrollWidth - 2;

      if ((isScrollingRight && isAtRightEdge) || (!isScrollingRight && isAtLeftEdge)) {
        // At the edge, let the browser handle vertical scrolling
        return;
      }

      // Intercept vertical scroll and do horizontal scroll instead
      e.preventDefault();
      el.scrollBy({
        left: (isScrollingRight ? 300 : -300) * speedMultiplier,
        behavior: 'smooth'
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [ref, speedMultiplier, ...deps]);
}
