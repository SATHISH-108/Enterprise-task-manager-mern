import { forwardRef } from "react";

const Input = forwardRef(function Input(
  { label, error, hint, className = "", ...rest },
  ref,
) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1 block text-xs font-medium text-slate-600">
          {label}
        </span>
      ) : null}
      <input
        ref={ref}
        className={`w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-shadow focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50 ${error ? "border-red-400" : ""} ${className}`}
        {...rest}
      />
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
});

export default Input;

export const Textarea = forwardRef(function Textarea(
  { label, error, hint, className = "", rows = 4, ...rest },
  ref,
) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1 block text-xs font-medium text-slate-600">
          {label}
        </span>
      ) : null}
      <textarea
        ref={ref}
        rows={rows}
        className={`w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-shadow focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50 ${error ? "border-red-400" : ""} ${className}`}
        {...rest}
      />
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
});
