import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { usersApi } from "../../shared/api/endpoints.js";
import Avatar from "../../shared/components/Avatar.jsx";

const MENTION_RE = /@([A-Za-z0-9._+-]*)$/;

/**
 * Single-line input with @-mention autocomplete.
 *
 * Detects when the caret sits right after `@<chars>`, opens a floating
 * dropdown of matching users (typed-ahead via `usersApi.list({q})`),
 * arrow-keys / Enter / click to insert. Calls back to the parent when the
 * user picks a mention so the parent can collect the ids and pass them to
 * the comment API on submit.
 *
 * Props:
 *   value, onChange         — controlled string
 *   onMentionAdded(userId)  — fired when the user picks a mention from the
 *                             dropdown. Parent maintains the ids set.
 *   onSubmit()              — fired on Enter (without active dropdown).
 *                             Optional — parent can also submit via a button.
 *   placeholder, autoFocus, disabled — passthroughs
 */
export default function MentionInput({
  value,
  onChange,
  onMentionAdded,
  onSubmit,
  placeholder,
  autoFocus = false,
  disabled = false,
  className = "",
}) {
  const inputRef = useRef(null);
  const [mentionQuery, setMentionQuery] = useState(null); // null = not in @ mode
  const [mentionStart, setMentionStart] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Debounce the query so we don't hammer the user-search endpoint on every
  // keystroke. 150ms feels instant but cuts request count by ~5x.
  const [debouncedQuery, setDebouncedQuery] = useState(null);
  useEffect(() => {
    if (mentionQuery === null) {
      setDebouncedQuery(null);
      return undefined;
    }
    const t = setTimeout(() => setDebouncedQuery(mentionQuery), 150);
    return () => clearTimeout(t);
  }, [mentionQuery]);

  const usersQ = useQuery({
    queryKey: ["mention-users", debouncedQuery],
    queryFn: () => usersApi.list({ q: debouncedQuery || "", limit: 6 }),
    enabled: debouncedQuery !== null,
    staleTime: 30_000,
  });

  const users = useMemo(
    () => usersQ.data?.data?.items || [],
    [usersQ.data],
  );

  // Reset highlight when results change.
  useEffect(() => setSelectedIndex(0), [users]);

  const closeMention = useCallback(() => {
    setMentionQuery(null);
    setSelectedIndex(0);
  }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);

    // Look for an open `@<chars>` token ending exactly at the caret.
    const caret = e.target.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const match = before.match(MENTION_RE);
    if (match) {
      setMentionQuery(match[1]);
      setMentionStart(caret - match[0].length);
    } else {
      closeMention();
    }
  };

  const insertMention = useCallback(
    (user) => {
      // Pick a stable handle: prefer name (compacted), fall back to email-local.
      const handle =
        (user.name && user.name.replace(/\s+/g, "")) ||
        (user.email && user.email.split("@")[0]) ||
        "user";
      const before = value.slice(0, mentionStart);
      const tokenLen = 1 + (mentionQuery?.length || 0); // `@` + chars typed so far
      const after = value.slice(mentionStart + tokenLen);
      const newValue = `${before}@${handle} ${after}`;
      onChange(newValue);
      if (onMentionAdded) onMentionAdded(String(user._id));
      closeMention();
      // Restore caret right after the inserted "@handle ".
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          const pos = before.length + 1 + handle.length + 1;
          el.focus();
          try {
            el.setSelectionRange(pos, pos);
          } catch {
            /* some inputs don't support range — ignore */
          }
        }
      });
    },
    [value, mentionStart, mentionQuery, onChange, onMentionAdded, closeMention],
  );

  const handleKeyDown = (e) => {
    if (mentionQuery !== null && users.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % users.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + users.length) % users.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(users[selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeMention();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && onSubmit && mentionQuery === null) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className={`relative flex-1 ${className}`}>
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs disabled:bg-slate-50 disabled:text-slate-400"
      />
      {mentionQuery !== null && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-64 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          {usersQ.isLoading ? (
            <div className="px-3 py-2 text-[11px] text-slate-400">
              Searching…
            </div>
          ) : users.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-slate-400">
              {mentionQuery
                ? `No users matching "${mentionQuery}"`
                : "Type to search users"}
            </div>
          ) : (
            <ul className="max-h-60 overflow-y-auto">
              {users.map((u, i) => (
                <li key={u._id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      // Prevent the input from losing focus before the click handler runs.
                      e.preventDefault();
                      insertMention(u);
                    }}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${
                      i === selectedIndex ? "bg-violet-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <Avatar name={u.name} src={u.avatar} size={20} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-800">
                        {u.name}
                      </div>
                      <div className="truncate text-[10px] text-slate-500">
                        {u.email}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

