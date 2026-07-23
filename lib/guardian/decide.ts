import type { RuleMode } from "./types";

/** 알림 발송 여부. 규칙 > important 순으로 판정하되, 발송 수단이 없으면 항상 false. */
export function shouldNotify(
  important: boolean,
  rule: RuleMode | null,
  hasPhone: boolean,
  hasSms: boolean,
): boolean {
  if (!hasPhone || !hasSms) return false;
  if (rule === "ignore") return false;
  if (rule === "always") return true;
  return important;
}
