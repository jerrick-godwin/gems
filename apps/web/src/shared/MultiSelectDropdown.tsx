import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
  id
}: {
  options: string[];
  selected: string[];
  onChange: (newSelected: string[]) => void;
  placeholder: string;
  id: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const filtered = options.filter((option) => option.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !dropdownRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={`multi-select ${isOpen ? "is-open" : ""}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={id}
        className="multi-select-trigger"
      >
        <span className="multi-select-value">
          {selected.length ? `${selected.length} selected` : placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          size={16}
          strokeWidth={2.4}
          className="multi-select-chevron"
        />
      </button>

      {isOpen && (
        <div className="multi-select-popover" id={id}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search countries..."
            className="multi-select-search"
            aria-label="Search countries"
            onClick={(event) => event.stopPropagation()}
          />
          <div className="multi-select-options">
            {filtered.map((option) => (
              <label key={option} className="multi-select-option">
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={(event) => {
                    if (event.target.checked) onChange([...selected, option]);
                    else onChange(selected.filter((item) => item !== option));
                  }}
                />
                {option}
              </label>
            ))}
            {filtered.length === 0 && <div className="multi-select-empty">No countries found</div>}
          </div>
        </div>
      )}
    </div>
  );
}
