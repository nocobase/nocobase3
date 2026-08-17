import { assetUrl, cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center overflow-hidden",
        className
      )}
    >
      <img
        src={assetUrl("/logo-mark.png")}
        alt=""
        className="size-full object-contain dark:hidden"
      />
      <img
        src={assetUrl("/logo-mark-dark.png")}
        alt=""
        className="hidden size-full object-contain dark:block"
      />
    </span>
  );
}

export function BrandWordmark({ className }: BrandLogoProps) {
  return (
    <span
      className={cn(
        "inline-flex h-8 shrink-0 items-center overflow-hidden",
        className
      )}
    >
      <img
        src={assetUrl("/logo.png")}
        alt="NocoBase"
        className="h-full w-auto object-contain dark:hidden"
      />
      <img
        src={assetUrl("/logo-dark.png")}
        alt="NocoBase"
        className="hidden h-full w-auto object-contain dark:block"
      />
    </span>
  );
}
type BrandProps = {
  className?: string;
  logoClassName?: string;
  showText?: boolean;
};

export function Brand({
  className,
  logoClassName,
  showText = true,
}: BrandProps) {
  return (
    <div className={cn("flex min-w-0 items-center", className)}>
      {showText ? (
        <BrandWordmark className={logoClassName} />
      ) : (
        <BrandLogo className={logoClassName} />
      )}
    </div>
  );
}
