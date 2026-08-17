import { cn } from "@/lib/utils";
import { getAIEmployeeAvatar, type AIEmployee } from "../../providers";
import type { CSSProperties } from "react";
import { useAITranslate } from "../../locales/use-ai-translate";

export function AIEmployeeAvatar({
  employee,
  flip = false,
  className,
  style,
}: {
  employee?: AIEmployee;
  flip?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const t = useAITranslate();
  return (
    <span
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full bg-transparent",
        className
      )}
      style={style}
    >
      <img
        src={getAIEmployeeAvatar(employee?.avatar, { flip })}
        alt={employee?.nickname ?? t("chat.aiEmployee", "AI employee")}
        className="size-full object-cover"
      />
    </span>
  );
}
