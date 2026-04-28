import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { notifsApi } from "../../shared/api/endpoints.js";
import { useSocketEvent } from "../../shared/socket/useSocket.js";
import { formatDistanceToNow } from "date-fns";
import usePushNotifications from "./usePushNotifications.js";

export default function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Brief shake/pulse on the bell when a new notification arrives.
  const [pulse, setPulse] = useState(false);
  const pulseTimerRef = useRef(null);
  const push = usePushNotifications();

  const count = useQuery({
    queryKey: ["notifs", "unread"],
    queryFn: () => notifsApi.unreadCount(),
    refetchInterval: 60_000,
  });

  const list = useQuery({
    queryKey: ["notifs", "list"],
    queryFn: () => notifsApi.list({ limit: 15 }),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id) => notifsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifs"] });
    },
  });
  const markAll = useMutation({
    mutationFn: () => notifsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifs"] }),
  });

  // Real-time arrival: refresh the bell counts AND surface as many attention
  // cues as the browser allows — toast popup, bell pulse, badge bounce,
  // synthesized ding sound, document.title flash, and (if granted) a native
  // OS notification.
  const onNotification = useCallback(
    (payload) => {
      qc.invalidateQueries({ queryKey: ["notifs"] });
      const n = payload?.notification;
      if (!n) return;

      // 1. Visual: pulse the bell + bounce the badge for a couple of seconds.
      setPulse(true);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = setTimeout(() => setPulse(false), 2400);

      // 2. Toast: title + body, click-through navigates + marks read.
      toast.info(
        ({ closeToast }) => (
          <button
            type="button"
            onClick={() => {
              if (n.link) navigate(n.link);
              if (n._id) markRead.mutate(n._id);
              closeToast();
            }}
            className="text-left"
          >
            <div className="text-xs font-semibold text-slate-900">
              {n.title || "New notification"}
            </div>
            {n.body ? (
              <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">
                {n.body}
              </div>
            ) : null}
            {n.link ? (
              <div className="mt-1 text-[10px] font-medium text-violet-600">
                Click to open →
              </div>
            ) : null}
          </button>
        ),
        { autoClose: 5000 },
      );

      // 3. Audio: short synthesised "ding" via Web Audio API. No asset file
      //    needed. Browsers block AudioContext until the user has clicked
      //    the page at least once — first notification after a fresh reload
      //    may be silent.
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          osc.type = "sine";
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.4);
        }
      } catch {
        /* autoplay blocked — silent ok */
      }

      // 4. Document title flash: prepend "(•) " for ~5s so a backgrounded
      //    tab also signals activity in the OS tab bar.
      if (typeof document !== "undefined") {
        const original = document.title.replace(/^\(•\)\s*/, "");
        document.title = `(•) ${original}`;
        setTimeout(() => {
          document.title = document.title.replace(/^\(•\)\s*/, "");
        }, 5000);
      }

      // 5. Native OS notification (only if user granted permission, e.g. via
      //    the push opt-in in this dropdown). Best-effort — silently ignored
      //    if not supported / denied.
      try {
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted" &&
          typeof document !== "undefined" &&
          document.visibilityState !== "visible"
        ) {
          const native = new Notification(n.title || "New notification", {
            body: n.body || "",
            icon: "/favicon.ico",
            tag: String(n._id || ""),
          });
          native.onclick = () => {
            window.focus();
            if (n.link) navigate(n.link);
            if (n._id) markRead.mutate(n._id);
            native.close();
          };
        }
      } catch {
        /* ignore */
      }
    },
    [qc, navigate, markRead],
  );
  useSocketEvent("notification", onNotification);

  useEffect(() => () => {
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (!e.target.closest("[data-bell]")) setOpen(false);
    };
    if (open) document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const unread = count.data?.data?.count || 0;
  const items = list.data?.data?.items || [];

  return (
    <div className="relative" data-bell>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative rounded-full p-2 text-slate-600 hover:bg-slate-100 ${pulse ? "animate-pulse text-violet-600 ring-2 ring-violet-300" : ""}`}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            className={`absolute right-1 top-1 min-w-4 rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white ${pulse ? "animate-bounce" : ""}`}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-40 w-[360px] overflow-hidden rounded-lg border border-slate-100 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-xs font-semibold text-slate-700">
              Notifications
            </span>
            {unread > 0 && (
              <button
                className="text-[11px] font-medium text-slate-500 hover:text-slate-800"
                onClick={() => markAll.mutate()}
              >
                Mark all read
              </button>
            )}
          </div>
          {push.supported && (
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
              <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                {push.subscribed ? (
                  <Bell size={12} className="text-emerald-600" />
                ) : (
                  <BellOff size={12} className="text-slate-400" />
                )}
                Browser push
              </span>
              <button
                disabled={push.busy}
                onClick={() =>
                  push.subscribed ? push.unsubscribe() : push.subscribe()
                }
                className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {push.busy
                  ? "..."
                  : push.subscribed
                    ? "Disable"
                    : "Enable"}
              </button>
            </div>
          )}
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-500">
                You're all caught up.
              </div>
            ) : (
              items.map((n) => (
                <Link
                  key={n._id}
                  to={n.link || "#"}
                  onClick={() => {
                    if (!n.read) markRead.mutate(n._id);
                    setOpen(false);
                  }}
                  className={`block border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50 ${n.read ? "opacity-60" : ""}`}
                >
                  <div className="text-xs font-medium text-slate-800">
                    {n.title}
                  </div>
                  {n.body ? (
                    <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
                      {n.body}
                    </div>
                  ) : null}
                  <div className="mt-1 text-[10px] text-slate-400">
                    {formatDistanceToNow(new Date(n.createdAt), {
                      addSuffix: true,
                    })}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
