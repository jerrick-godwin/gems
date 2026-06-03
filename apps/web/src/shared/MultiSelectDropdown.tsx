import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder
}: {
  options: string[];
  selected: string[];
  onChange: (newSelected: string[]) => void;
  placeholder: string;
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
    <div className="multi-select" ref={dropdownRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        style={{
          width: "100%",
          height: 44,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          background: "var(--panel-strong)",
          border: "1px solid var(--line)",
          padding: "0 12px",
          borderRadius: "var(--radius)",
          color: "var(--ink)",
          fontWeight: 700
        }}
      >
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected.length ? `${selected.length} selected` : placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          size={16}
          strokeWidth={2.4}
          style={{
            flex: "0 0 auto",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform var(--duration-fast) ease"
          }}
        />
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            width: "240px",
            background: "var(--bg)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            marginTop: 4,
            zIndex: 50,
            padding: 8,
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.5)"
          }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search countries..."
            style={{ width: "100%", marginBottom: 8, padding: 8, background: "var(--panel-strong)", border: "1px solid var(--line)", borderRadius: "var(--radius)", color: "var(--ink)" }}
            onClick={(event) => event.stopPropagation()}
          />
          <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map((option) => (
              <label key={option} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", cursor: "pointer", color: "var(--ink)" }}>
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
            {filtered.length === 0 && <div style={{ padding: 8, color: "var(--sage)", fontSize: 12 }}>No countries found</div>}
          </div>
        </div>
      )}
    </div>
  );
}
