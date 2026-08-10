import { ExternalLink, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <Button
      asChild
      variant={isClaimed ? "outline" : "default"}
      className="h-auto w-full py-3.5"
    >
      <a href={href} target="_blank" rel="noopener noreferrer">
        {isClaimed ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <ExternalLink className="h-4 w-4 opacity-70" />
        )}
        <span>{label}</span>
      </a>
    </Button>
  );
}
