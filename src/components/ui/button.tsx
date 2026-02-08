import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  loading?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold font-display transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
        {
          "bg-primary text-primary-foreground border-2 border-primary shadow hover:bg-primary/90 hover:brightness-110":
            variant === "default",
          "bg-secondary text-secondary-foreground border-2 border-border shadow-sm hover:bg-secondary/80":
            variant === "secondary",
          "border-2 border-border bg-background shadow-sm hover:bg-accent hover:text-accent-foreground hover:border-accent":
            variant === "outline",
          "hover:bg-accent hover:text-accent-foreground": variant === "ghost",
        },
        {
          "h-9 px-4 py-2": size === "default",
          "h-8 rounded-lg px-3 text-xs": size === "sm",
          "h-10 rounded-lg px-8": size === "lg",
        },
        className,
      )}
      ref={ref}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export { Button };
