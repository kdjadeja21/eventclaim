"use client";

export default function LogoImage({ src, alt }: { src: string; alt: string }) {
  const isCursorLogo = src.includes("cursor_logo.svg");

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`h-7 w-auto max-w-[80px] object-contain ${isCursorLogo ? "[filter:brightness(0)]" : ""}`}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
