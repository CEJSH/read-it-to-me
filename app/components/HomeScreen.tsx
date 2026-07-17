interface HomeScreenProps {
  onShoot: () => void;
}

export function HomeScreen({ onShoot }: HomeScreenProps) {
  return (
    <section className="flex flex-1 flex-col">
      <button
        aria-label="종이를 찍으면 읽어줍니다"
        onClick={onShoot}
        className="flex flex-1 flex-col items-center justify-center gap-[18px] rounded-[36px] bg-gradient-to-b from-blue to-blue-dk text-white shadow-[0_10px_28px_rgba(36,86,230,0.32)] transition-transform duration-75 ease-out active:scale-[0.975]"
      >
        <svg
          className="h-[120px] w-[120px]"
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
        <span className="text-[34px] font-extrabold tracking-[-0.5px]">
          찍어봐
        </span>
        <span className="text-lg opacity-85">종이를 찍으면 읽어줄게</span>
      </button>
    </section>
  );
}
