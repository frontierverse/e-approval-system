export default function Loading() {
  return (
    <div
      aria-label="페이지 불러오는 중"
      className="h-1 overflow-hidden rounded-full bg-[#edf1f5]"
    >
      <div className="h-full w-1/3 animate-pulse rounded-full bg-[#196b69]" />
    </div>
  );
}
