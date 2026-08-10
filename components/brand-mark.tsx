import { cn } from "@/lib/utils";

const sizeClass = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
} as const;

/**
 * Official 2D Cursor Cube mark (mask so it takes `text-*` / `bg-current`).
 * Prefer this over letter marks or custom lockups.
 */
export function BrandMarkIcon({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      role="img"
      aria-label="Cursor"
      className={cn(
        "inline-block shrink-0 bg-current",
        sizeClass[size],
        className
      )}
      style={{
        maskImage: "url(/brand/cursor-cube.svg)",
        WebkitMaskImage: "url(/brand/cursor-cube.svg)",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

/** Horizontal Cursor lockup (cube + wordmark). */
export function BrandWordmark({
  className,
  invert = false,
}: {
  className?: string;
  /** Dark mark on light backgrounds */
  invert?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/partner-logos/cursor_logo.svg"
      alt="Cursor"
      className={cn(
        "h-8 w-auto sm:h-10",
        invert && "[filter:brightness(0)]",
        className
      )}
    />
  );
}
