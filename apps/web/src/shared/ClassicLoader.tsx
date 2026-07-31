import type { ComponentPropsWithoutRef, CSSProperties } from "react";

type ClassicLoaderProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  label?: string;
  size?: CSSProperties["width"];
};

const SEGMENTS = Array.from({ length: 12 }, (_, index) => ({
  index,
  style: {
    animationDelay: `calc(var(--classic-loader-duration, 1.2s) / 12 * ${index - 12})`,
    transform: `rotate(${index * 30}deg) translate(146%)`
  } satisfies CSSProperties
}));

export function ClassicLoader({
  "aria-hidden": ariaHidden,
  className,
  label = "Loading",
  role,
  size = 20,
  style,
  ...props
}: ClassicLoaderProps) {
  const decorative = ariaHidden === true || ariaHidden === "true";
  const dimension = typeof size === "number" ? `${size}px` : size;

  return (
    <span
      {...props}
      aria-hidden={ariaHidden}
      aria-label={decorative ? undefined : label}
      className={["classic-loader", className].filter(Boolean).join(" ")}
      role={decorative ? undefined : role ?? "status"}
      style={{ ...style, width: dimension, height: dimension }}
    >
      <span aria-hidden="true" className="classic-loader__segments">
        {SEGMENTS.map(({ index, style: segmentStyle }) => (
          <span
            className="classic-loader__segment"
            key={index}
            style={segmentStyle}
          />
        ))}
      </span>
    </span>
  );
}
