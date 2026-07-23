import Link from "next/link";
import { getGuardian } from "@/lib/guardian/adapters";

export const metadata = { robots: { index: false, follow: false } };

export default async function GuardianList({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  const accessKey = process.env.GUARDIAN_ACCESS_KEY;
  const guardian = getGuardian();

  if (!guardian || !accessKey || key !== accessKey) {
    return (
      <main className="mx-auto max-w-[520px] p-6">
        <p className="text-lg font-bold">접근 권한이 없어요.</p>
      </main>
    );
  }

  const scans = await guardian.store.recentScans(50);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col gap-3 p-4">
      <h1 className="mx-1 my-1.5 text-[22px] font-extrabold">
        📚 최근 문서 기록
      </h1>
      {scans.length === 0 && (
        <p className="mx-1 text-sub">아직 기록이 없어요.</p>
      )}
      {scans.map((s) => (
        <Link
          key={s.id}
          href={`/g/${s.token}`}
          className={`flex items-center gap-3 rounded-[20px] border px-5 py-4 shadow-soft ${
            s.important ? "border-amber/60 bg-[#FFF7EE]" : "border-line bg-card"
          }`}
        >
          <span className="text-[24px]">{s.important ? "⚠️" : "📄"}</span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base font-bold">{s.sender}</span>
            <span className="text-sm text-sub">
              {new Date(s.createdAt).toLocaleString("ko-KR")}
              {s.notified ? " · 문자 보냄" : ""}
            </span>
          </span>
        </Link>
      ))}
    </main>
  );
}
