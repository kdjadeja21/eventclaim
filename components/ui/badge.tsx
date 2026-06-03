import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent gradient-brand text-white hover:opacity-90",
        secondary:
          "border-transparent bg-muted text-muted-foreground hover:bg-muted/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground border-primary/20",
        success:
          "border-emerald-200 bg-emerald-50 text-emerald-950 [&_svg]:text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-50 dark:[&_svg]:text-emerald-200",
        warning:
          "border-amber-200 bg-amber-50 text-amber-950 [&_svg]:text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50 dark:[&_svg]:text-amber-200",
        info:
          "border-primary/25 bg-primary/10 text-primary dark:border-primary/40 dark:bg-primary/20 dark:text-primary-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
