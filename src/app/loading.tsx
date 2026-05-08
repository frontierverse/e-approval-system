export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded-md bg-[#e7ecf2]" />
      <div className="h-5 w-full max-w-2xl animate-pulse rounded-md bg-[#edf1f5]" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-32 animate-pulse rounded-md border border-[#d9dee7] bg-white"
          />
        ))}
      </div>
    </div>
  );
}
