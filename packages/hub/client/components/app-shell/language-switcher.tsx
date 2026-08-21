import { useSetLocale, useTranslate } from "@refinedev/core";
import { getCurrentLocale, useEnabledLocales } from "@nocobase/portal-sdk/i18n";
import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const translate = useTranslate();
  const changeLocale = useSetLocale();
  const locales = useEnabledLocales();
  const currentLocale = getCurrentLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "h-10 w-10 rounded-xl border-border/70 bg-background/60",
              className,
            )}
            aria-label={translate("shell.language", "Language")}
          >
            <Languages aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuRadioGroup
          value={currentLocale}
          onValueChange={(locale: string) => {
            if (locale !== currentLocale) void changeLocale(locale);
          }}
        >
          {locales.map((locale) => (
            <DropdownMenuRadioItem key={locale.locale} value={locale.locale}>
              {translate(`locale.${locale.locale}`, locale.label)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
