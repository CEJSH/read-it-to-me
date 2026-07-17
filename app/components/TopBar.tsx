interface TopBarProps {
  onOpenSettings: () => void;
}

export function TopBar({ onOpenSettings }: TopBarProps) {
  return (
    <div className="flex items-center justify-between px-1 pt-0.5 pb-2.5">
      <div className="text-[17px] font-extrabold tracking-[-0.3px] text-sub">
        읽어줄게
      </div>
      <button
        aria-label="보호자 설정"
        onClick={onOpenSettings}
        className="rounded-xl p-2 text-xl text-sub"
      >
        ⚙️
      </button>
    </div>
  );
}
