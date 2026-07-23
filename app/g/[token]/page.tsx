import { getGuardian } from "@/lib/guardian/adapters";
import { RuleButtons } from "../RuleButtons";

export default async function GuardianView({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const guardian = getGuardian();
  const { token } = await params;
  const scan = guardian ? await guardian.store.getScanByToken(token) : null;

  if (!guardian || !scan) {
    return (
      <main className="mx-auto max-w-[520px] p-6">
        <p className="text-lg font-bold">문서를 찾을 수 없어요.</p>
      </main>
    );
  }

  const rule = await guardian.store.getRule(scan.senderKey);
  const when = new Date(scan.createdAt).toLocaleString("ko-KR");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col gap-3.5 p-4">
      <h1 className="mx-1 my-1.5 text-[22px] font-extrabold">
        📄 동생이 찍은 문서
      </h1>
      <p className="mx-1 text-sm text-sub">{when}</p>

      {/* eslint-disable-next-line @next/next/no-img-element -- private blob 프록시라 next/image 최적화 대상 아님 */}
      <img
        src={`/api/guardian/image/${token}`}
        alt="동생이 촬영한 문서 사진"
        className="w-full rounded-[20px] border border-line"
      />

      {[
        { icon: "✉️", title: "누가 보냈어요", text: scan.sender },
        { icon: "💬", title: "무슨 내용이에요", text: scan.message },
        { icon: "✅", title: "할 일", text: scan.action },
      ].map((c) => (
        <div
          key={c.title}
          className="flex items-start gap-4 rounded-[20px] border border-line bg-card px-5 py-[18px] shadow-soft"
        >
          <span className="text-[28px] leading-none">{c.icon}</span>
          <span className="flex flex-col">
            <span className="mb-1 text-[14px] font-extrabold text-sub">
              {c.title}
            </span>
            <span className="text-lg font-bold leading-[1.45]">{c.text}</span>
          </span>
        </div>
      ))}

      <RuleButtons token={token} senderKey={scan.senderKey} initialMode={rule} />
    </main>
  );
}
