"use client";

import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Moon, Sun } from "lucide-react";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className={cn(
        "rounded-xl",
        "border-border/70",
        "bg-background/60",
        className,
        "h-10",
        "w-10"
      )}
    >
      <Sun
        className={cn(
          "h-[1.2rem]",
          "w-[1.2rem]",
          "rotate-0",
          "scale-100",
          "transition-all",
          "duration-200",
          {
            "-rotate-90 scale-0": isDark,
          }
        )}
      />
      <Moon
        className={cn(
          "absolute",
          "h-[1.2rem]",
          "w-[1.2rem]",
          "rotate-90",
          "scale-0",
          "transition-all",
          "duration-200",
          {
            "rotate-0 scale-100": isDark,
          }
        )}
      />
      <span className="sr-only">
        Switch to {isDark ? "light" : "dark"} mode
      </span>
    </Button>
  );
}

ThemeToggle.displayName = "ThemeToggle";
