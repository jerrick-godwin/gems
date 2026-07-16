import { Search, X } from "lucide-react";

interface MarketplaceSearchProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function MarketplaceSearch({ id, value, onChange, className = "" }: MarketplaceSearchProps) {
  return (
    <div className={`global-search${className ? ` ${className}` : ""}`}>
      <span className="global-search-icon" aria-hidden="true">
        <Search size={17} strokeWidth={2.1} />
      </span>
      <label className="u-visually-hidden" htmlFor={id}>Search gemstone listings</label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search gemstones"
        autoComplete="off"
      />
      {value && (
        <button className="global-search-clear" type="button" onClick={() => onChange("")} aria-label="Clear search">
          <X size={17} strokeWidth={2.4} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
