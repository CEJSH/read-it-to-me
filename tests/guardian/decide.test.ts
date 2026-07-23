import { describe, expect, it } from "vitest";
import { shouldNotify } from "@/lib/guardian/decide";

describe("shouldNotify", () => {
  it("important 문서는 알림", () => {
    expect(shouldNotify(true, null, true, true)).toBe(true);
  });
  it("비중요 문서는 알림 안 함", () => {
    expect(shouldNotify(false, null, true, true)).toBe(false);
  });
  it("ignore 규칙은 important여도 억제", () => {
    expect(shouldNotify(true, "ignore", true, true)).toBe(false);
  });
  it("always 규칙은 비중요여도 알림", () => {
    expect(shouldNotify(false, "always", true, true)).toBe(true);
  });
  it("보호자 번호 없으면 항상 억제", () => {
    expect(shouldNotify(true, "always", false, true)).toBe(false);
  });
  it("SMS 발송 수단 없으면 항상 억제", () => {
    expect(shouldNotify(true, "always", true, false)).toBe(false);
  });
});
