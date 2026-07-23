interface HomeScreenProps {
  onShoot: () => void;
}

export function HomeScreen({ onShoot }: HomeScreenProps) {
  return (
    <section className="flex flex-1 flex-col">
      <button
        aria-label="종이를 찍으면 읽어줍니다"
        onClick={onShoot}
        style={{
          background:
            "linear-gradient(158deg, #3f6bf4 0%, #2456e6 46%, #1b3ea6 100%)",
        }}
        className="animate-rise group relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden rounded-[36px] text-white shadow-lift transition-transform duration-100 ease-out active:scale-[0.98]"
      >
        {/* Soft light from the top-center, giving the surface some dimension. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_80%_at_50%_-8%,rgba(255,255,255,0.30),transparent_58%)]"
        />

        <span className="animate-float relative grid h-[132px] w-[132px] place-items-center rounded-full bg-white/12 ring-1 ring-white/20">
          <svg
            className="h-[74px] w-[74px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </span>

        <span className="relative flex flex-col items-center gap-2">
          <span className="text-[40px] font-extrabold leading-none tracking-[-1px]">
            찍어봐
          </span>
          <span className="text-[17px] font-medium text-white/80">
            종이를 찍으면 읽어줄게
          </span>
        </span>
      </button>
    </section>
  );
}
