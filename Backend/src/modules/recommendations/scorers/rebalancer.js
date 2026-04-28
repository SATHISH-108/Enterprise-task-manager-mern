import { REBALANCER, NEXT_TASK_PRIORITY_VALUE } from "./weights.js";

const isActive = (t) => t.status !== "completed" && t.status !== "archived";

const priorityWeight = (p) => NEXT_TASK_PRIORITY_VALUE[p] ?? 0.5;

const stddev = (xs) => {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(v);
};

/**
 * Detect overloaded users in a project and propose 1-task reassignments.
 *
 * Inputs:
 *   project: { _id, members: [User] }
 *   tasks: project task list (active + completed)
 *   completedLast30dByUser: Map<UserId, Number> — used as a proxy for "fit"
 *
 * Returns:
 *   suggestions: [{ taskId, taskTitle, fromUserId, fromUserName, toUserId,
 *                   toUserName, expectedLoadDelta, fitNote }]
 */
export const suggestRebalance = ({
  project,
  tasks,
  completedLast30dByUser = new Map(),
}) => {
  const active = tasks.filter(isActive);
  if (active.length < REBALANCER.MIN_ACTIVE_FOR_OVERLOAD) return [];

  // Build per-user load (priority-weighted active task count)
  const memberIds = (project.members || []).map((m) => String(m._id || m));
  const memberById = new Map(
    (project.members || []).map((m) => [
      String(m._id || m),
      { id: String(m._id || m), name: m.name || m.email || "—" },
    ]),
  );
  const loadByUser = new Map(memberIds.map((id) => [id, 0]));
  const tasksByAssignee = new Map(memberIds.map((id) => [id, []]));

  for (const t of active) {
    const w = priorityWeight(t.priority);
    for (const a of t.assignees || []) {
      const id = String(a._id || a);
      if (!loadByUser.has(id)) {
        loadByUser.set(id, 0);
        tasksByAssignee.set(id, []);
        memberById.set(id, { id, name: a.name || "—" });
      }
      loadByUser.set(id, loadByUser.get(id) + w);
      tasksByAssignee.get(id).push(t);
    }
  }

  const loadVals = [...loadByUser.values()];
  if (loadVals.length === 0) return [];
  const mean = loadVals.reduce((a, b) => a + b, 0) / loadVals.length;
  const sd = stddev(loadVals);
  const baselineStddev = sd;
  const overloadCutoff = mean + sd;

  const overloaded = [...loadByUser.entries()]
    .filter(
      ([id, load]) =>
        load > overloadCutoff &&
        (tasksByAssignee.get(id) || []).length >=
          REBALANCER.MIN_ACTIVE_FOR_OVERLOAD,
    )
    .sort((a, b) => b[1] - a[1]);

  if (overloaded.length === 0) return [];

  const movableTasks = (userId) =>
    (tasksByAssignee.get(userId) || []).filter(
      (t) =>
        (t.status === "todo" || t.status === "backlog") &&
        (!t.actualHours || t.actualHours === 0),
    );

  // Stable ranking helpers
  const candidatesFor = (currentLoadOf) => {
    return memberIds
      .filter((id) => loadByUser.get(id) < mean)
      .map((id) => ({
        id,
        name: memberById.get(id)?.name || "—",
        headroom: mean - loadByUser.get(id),
        completed30d: completedLast30dByUser.get(id) || 0,
      }))
      .sort(
        (a, b) =>
          b.headroom - a.headroom ||
          b.completed30d - a.completed30d ||
          a.name.localeCompare(b.name),
      );
  };

  const suggestions = [];
  // Mutable copy of loads so subsequent suggestions consider previous reassignments.
  const simulatedLoad = new Map(loadByUser);

  for (const [overloadedId] of overloaded) {
    if (suggestions.length >= REBALANCER.MAX_SUGGESTIONS) break;
    const tasksToShift = movableTasks(overloadedId);

    for (const task of tasksToShift) {
      if (suggestions.length >= REBALANCER.MAX_SUGGESTIONS) break;

      const candidates = candidatesFor();
      if (candidates.length === 0) continue;
      const target = candidates[0];

      // Simulate: move this task's weight from overloadedId to target.id
      const w = priorityWeight(task.priority);
      const sim = new Map(simulatedLoad);
      sim.set(overloadedId, sim.get(overloadedId) - w);
      sim.set(target.id, (sim.get(target.id) || 0) + w);
      const newStd = stddev([...sim.values()]);

      if (
        baselineStddev > 0 &&
        (baselineStddev - newStd) / baselineStddev <
          REBALANCER.MIN_STDDEV_IMPROVEMENT_PCT
      )
        continue;

      // Commit simulation for next iteration
      simulatedLoad.set(overloadedId, sim.get(overloadedId));
      simulatedLoad.set(target.id, sim.get(target.id));

      suggestions.push({
        taskId: String(task._id),
        taskTitle: task.title,
        priority: task.priority,
        fromUserId: overloadedId,
        fromUserName: memberById.get(overloadedId)?.name || "—",
        toUserId: target.id,
        toUserName: target.name,
        expectedLoadDelta: Number(w.toFixed(2)),
        fitNote:
          target.completed30d > 0
            ? `${target.name} completed ${target.completed30d} task${
                target.completed30d === 1 ? "" : "s"
              } in the last 30 days and has the most headroom.`
            : `${target.name} has the most capacity right now.`,
      });
    }
  }

  return suggestions;
};
