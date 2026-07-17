export function WaitScreen() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-7">
      <div
        aria-hidden="true"
        className="animate-pulse-grow h-[140px] w-[140px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#4a75f0,var(--color-blue-dk))]"
      />
      <p className="text-2xl font-bold text-sub">읽고 있어요…</p>
    </section>
  );
}
