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
          "border-zinc-300 bg-zinc-200 text-zinc-800 [&_svg]:text-zinc-600 hover:bg-zinc-300/80 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:[&_svg]:text-zinc-400",
        destructive:
          "border-red-300 bg-red-200 text-red-900 [&_svg]:text-red-700 hover:bg-red-300/80 dark:border-red-700 dark:bg-red-900 dark:text-red-200 dark:[&_svg]:text-red-400",
        outline: "text-foreground border-primary/20",
        success:
          "border-emerald-300 bg-emerald-200 text-emerald-900 [&_svg]:text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-200 dark:[&_svg]:text-emerald-400",
        warning:
          "border-amber-300 bg-amber-200 text-amber-900 [&_svg]:text-amber-700 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-200 dark:[&_svg]:text-amber-400",
        info:
          "border-sky-300 bg-sky-200 text-sky-900 [&_svg]:text-sky-700 dark:border-sky-700 dark:bg-sky-900 dark:text-sky-200 dark:[&_svg]:text-sky-400",
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
