import { useEffect, type RefObject } from "react";

export function useOutsideClick<TElement extends HTMLElement>(
  ref: RefObject<TElement>,
  onOutsideClick: () => void,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;

    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onOutsideClick();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [enabled, onOutsideClick, ref]);
}
