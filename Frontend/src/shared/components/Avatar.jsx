const palette = [
  "bg-rose-200 text-rose-900",
  "bg-amber-200 text-amber-900",
  "bg-emerald-200 text-emerald-900",
  "bg-sky-200 text-sky-900",
  "bg-violet-200 text-violet-900",
  "bg-pink-200 text-pink-900",
  "bg-lime-200 text-lime-900",
];

const pick = (s = "?") => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
};

export default function Avatar({ name = "?", src, size = 28 }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const cls = pick(name);
  if (src) {
    return (
      <img
        alt={name}
        src={src}
        style={{ width: size, height: size }}
        className="rounded-full border border-white object-cover"
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={`inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-white ${cls}`}
      title={name}
    >
      {initials || "?"}
    </span>
  );
}
