export default function Spinner({ className = "h-5 w-5" }) {
  return (
    <span
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 ${className}`}
    />
  );
}
