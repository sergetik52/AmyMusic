import { useEffect } from "react";

export function useEscapeKey(isEnabled, onEscape) {
  useEffect(() => {
    if (!isEnabled) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onEscape?.(event);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isEnabled, onEscape]);
}
