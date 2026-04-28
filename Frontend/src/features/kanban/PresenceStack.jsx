import { useEffect, useState } from "react";
import { useAuth } from "../../store/authStore.js";
import {
  joinTask,
  leaveTask,
  getSocket,
} from "../../shared/socket/socketClient.js";
import Avatar from "../../shared/components/Avatar.jsx";

/**
 * Avatar stack of every other user currently viewing this task.
 *
 * Drives off the per-task presence room maintained server-side. Single-user
 * (only me viewing) renders nothing, so the header stays clean.
 */
export default function PresenceStack({ taskId }) {
  const { user } = useAuth();
  const [viewers, setViewers] = useState([]);

  useEffect(() => {
    if (!taskId || !user?.id) return undefined;

    const onPresence = (payload) => {
      if (!payload || String(payload.taskId) !== String(taskId)) return;
      setViewers(payload.viewers || []);
    };

    const socket = getSocket();
    socket.on("task:presence", onPresence);

    joinTask(taskId, {
      userId: user.id,
      name: user.name,
      avatar: user.avatar,
    });

    return () => {
      socket.off("task:presence", onPresence);
      leaveTask(taskId);
      setViewers([]);
    };
  }, [taskId, user?.id, user?.name, user?.avatar]);

  const others = viewers.filter((v) => String(v.userId) !== String(user?.id));
  if (others.length === 0) return null;

  return (
    <div
      className="flex items-center gap-1.5"
      title={`${others.length} other ${others.length === 1 ? "person is" : "people are"} viewing this task`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      <div className="flex -space-x-1.5">
        {others.slice(0, 4).map((v) => (
          <div key={v.userId} className="ring-2 ring-white">
            <Avatar name={v.name || "?"} src={v.avatar} size={18} />
          </div>
        ))}
        {others.length > 4 ? (
          <span className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-slate-200 px-1 text-[9px] font-semibold text-slate-700 ring-2 ring-white">
            +{others.length - 4}
          </span>
        ) : null}
      </div>
    </div>
  );
}
