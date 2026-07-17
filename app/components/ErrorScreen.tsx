interface ErrorScreenProps {
  message: string;
  detail?: string;
  onRetry: () => void;
}

export function ErrorScreen({ message, detail, onRetry }: ErrorScreenProps) {
  const lines = message.split("\n");

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-[26px] text-center">
      <div className="text-8xl">🙈</div>
      <p className="m-0 text-[26px] font-extrabold leading-[1.5]">
        {lines.map((line, i) => (
          <span key={i}>
            {line}
            {i < lines.length - 1 && <br />}
          </span>
        ))}
        {detail && (
          <>
            <br />
            <span className="text-sm font-normal text-sub">({detail})</span>
          </>
        )}
      </p>
      <button
        onClick={onRetry}
        className="w-full rounded-[28px] bg-blue px-11 py-[26px] text-[26px] font-extrabold text-white"
      >
        📷 다시 찍기
      </button>
    </section>
  );
}
