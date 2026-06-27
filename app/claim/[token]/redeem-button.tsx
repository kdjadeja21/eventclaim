import { ExternalLink, CheckCircle2 } from "lucide-react";

export default function RedeemButton({
  href,
  label = "Redeem offer",
  isClaimed = false,
}: {
  href: string;
  label?: string;
  isClaimed?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        isClaimed
          ? "group flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-6 py-3.5 text-sm font-bold text-zinc-600 shadow-sm transition-all hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98]"
          : "group flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-6 py-3.5 text-sm font-bold text-white shadow-sm ring-1 ring-inset ring-zinc-900 transition-all hover:bg-zinc-800 hover:shadow-md active:scale-[0.98]"
      }
    >
      {isClaimed ? (
        <CheckCircle2 className="h-4 w-4 text-green-600 transition-colors" />
      ) : (
        <ExternalLink className="h-4 w-4 opacity-70 transition-opacity group-hover:opacity-100" />
      )}
      <span>{label}</span>
    </a>
  );
}
