/**
 * Unit tests for the recommendation scorers.
 *
 * The scorers are pure functions — no DB, no Redis, no LLM — so these tests
 * run as fast as plain JS and require no mock setup beyond fixture data.
 */

import { rankNextTasks } from "../../modules/recommendations/scorers/nextTask.js";
import { scoreProjectRisk } from "../../modules/recommendations/scorers/projectRisk.js";
import { suggestRebalance } from "../../modules/recommendations/scorers/rebalancer.js";

const FIXED_NOW = new Date("2026-04-26T12:00:00Z").getTime();
const inDays = (n) => new Date(FIXED_NOW + n * 86_400_000);

const oid = (n) => `0000000000000000000000${String(n).padStart(2, "0")}`;

describe("rankNextTasks", () => {
  it("ranks an overdue urgent task above a future urgent task", () => {
    const me = oid(1);
    const candidates = [
      {
        _id: oid(10),
        title: "future urgent",
        status: "todo",
        priority: "urgent",
        dueDate: inDays(5),
        assignees: [me],
        dependencies: [],
      },
      {
        _id: oid(11),
        title: "overdue urgent",
        status: "todo",
        priority: "urgent",
        dueDate: inDays(-2),
        assignees: [me],
        dependencies: [],
      },
    ];
    const result = rankNextTasks({
      userId: me,
      candidates,
      limit: 5,
      now: FIXED_NOW,
    });
    expect(result[0].title).toBe("overdue urgent");
    expect(result[1].title).toBe("future urgent");
  });

  it("drops a task whose dependencies are not completed below an otherwise-equal task", () => {
    // Compare two tasks identical in priority/status/urgency/ownership and only
    // differ on dependency readiness. The clear one must outrank the blocked one.
    // (We don't assert that depReadiness can override much higher urgency on
    // a different task — by design it's a 0.20-weight soft factor, not a hard
    // filter, since urgent-overdue work shouldn't disappear from the list just
    // because a dependency hasn't landed yet.)
    const me = oid(1);
    const depMap = new Map([[oid(99), "in_progress"]]);
    const candidates = [
      {
        _id: oid(10),
        title: "blocked-by-dep",
        status: "todo",
        priority: "high",
        dueDate: inDays(2),
        assignees: [me],
        dependencies: [oid(99)],
      },
      {
        _id: oid(11),
        title: "free-and-clear",
        status: "todo",
        priority: "high",
        dueDate: inDays(2),
        assignees: [me],
        dependencies: [],
      },
    ];
    const result = rankNextTasks({
      userId: me,
      candidates,
      depStatusByTaskId: depMap,
      limit: 5,
      now: FIXED_NOW,
    });
    expect(result[0].title).toBe("free-and-clear");
    expect(result[1].title).toBe("blocked-by-dep");
  });

  it("filters out completed and archived tasks", () => {
    const me = oid(1);
    const candidates = [
      {
        _id: oid(10),
        title: "done",
        status: "completed",
        priority: "urgent",
        dueDate: inDays(0),
        assignees: [me],
        dependencies: [],
      },
      {
        _id: oid(11),
        title: "live",
        status: "todo",
        priority: "low",
        dueDate: inDays(7),
        assignees: [me],
        dependencies: [],
      },
    ];
    const result = rankNextTasks({
      userId: me,
      candidates,
      limit: 5,
      now: FIXED_NOW,
    });
    expect(result.map((r) => r.title)).toEqual(["live"]);
  });
});

describe("scoreProjectRisk", () => {
  const project = { _id: oid(1), name: "Demo" };

  it("returns a zero-score / low-label payload for an empty project", () => {
    const out = scoreProjectRisk({
      project,
      tasks: [],
      now: FIXED_NOW,
    });
    expect(out.score).toBe(0);
    expect(out.label).toBe("low");
    expect(out.factors).toEqual([]);
  });

  it("scores a project with overdue + blocked + uneven load + velocity drop as elevated risk", () => {
    // Combine multiple driving factors. The label thresholds (≥60 high, ≥30
    // medium) are intentionally tuned so "high" requires several factors all
    // pushing in the same direction — assert the broader contract here:
    //   * label is not "low"
    //   * score is comfortably above the medium floor
    // A second test (`escalates further when factors compound`) below proves
    // the label moves from medium → high when more bad signals are added.
    const overdueTodo = Array.from({ length: 4 }, (_, i) => ({
      _id: oid(10 + i),
      status: "todo",
      priority: "high",
      dueDate: inDays(-3),
      estimatedHours: 4,
      actualHours: 0,
      assignees: [oid(1)],
    }));
    const blocked = Array.from({ length: 2 }, (_, i) => ({
      _id: oid(20 + i),
      status: "blocked",
      priority: "medium",
      dueDate: inDays(-1),
      estimatedHours: 4,
      actualHours: 0,
      assignees: [oid(1)],
    }));
    const out = scoreProjectRisk({
      project,
      tasks: [...overdueTodo, ...blocked],
      velocity: { completedLast7d: 0, completedPrev7d: 5 },
      now: FIXED_NOW,
    });
    expect(out.label).not.toBe("low");
    expect(out.score).toBeGreaterThanOrEqual(40);
  });

  it("escalates the label when multiple factors compound (chain + imbalance + total overdue)", () => {
    // Maxed-out fixture: every active task is overdue, two are blocked in a
    // chain, load is heavily imbalanced across two assignees, and velocity
    // has fully collapsed. This is the only deterministic way to hit "high"
    // without relying on rounding around the threshold.
    const blockedA = oid(30);
    const blockedB = oid(31);
    const overdueAlice = Array.from({ length: 8 }, (_, i) => ({
      _id: oid(10 + i),
      status: "todo",
      priority: "high",
      dueDate: inDays(-4),
      estimatedHours: 4,
      actualHours: 0,
      assignees: [oid(1)],
    }));
    const blockedChain = [
      {
        _id: blockedA,
        status: "blocked",
        priority: "high",
        dueDate: inDays(-2),
        estimatedHours: 4,
        actualHours: 0,
        assignees: [oid(1)],
        dependencies: [blockedB],
      },
      {
        _id: blockedB,
        status: "blocked",
        priority: "high",
        dueDate: inDays(-2),
        estimatedHours: 4,
        actualHours: 0,
        assignees: [oid(1)],
        dependencies: [],
      },
    ];
    const lightBob = [
      {
        _id: oid(40),
        status: "todo",
        priority: "low",
        dueDate: inDays(10),
        estimatedHours: 1,
        actualHours: 0,
        assignees: [oid(2)],
      },
    ];
    const depMap = new Map([[String(blockedA), [String(blockedB)]]]);
    const out = scoreProjectRisk({
      project,
      tasks: [...overdueAlice, ...blockedChain, ...lightBob],
      depMap,
      velocity: { completedLast7d: 0, completedPrev7d: 8 },
      now: FIXED_NOW,
    });
    expect(out.label).toBe("high");
    expect(out.score).toBeGreaterThanOrEqual(60);
  });

  it("scores a healthy mid-sprint project as low", () => {
    const tasks = [
      ...Array.from({ length: 3 }, (_, i) => ({
        _id: oid(10 + i),
        status: "in_progress",
        priority: "medium",
        dueDate: inDays(7),
        estimatedHours: 4,
        actualHours: 1,
        assignees: [oid(1)],
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        _id: oid(20 + i),
        status: "completed",
        priority: "medium",
        completionDate: inDays(-2),
        assignees: [oid(2)],
      })),
    ];
    const out = scoreProjectRisk({
      project,
      tasks,
      velocity: { completedLast7d: 3, completedPrev7d: 3 },
      now: FIXED_NOW,
    });
    expect(out.label).toBe("low");
    expect(out.score).toBeLessThan(30);
  });

  it("factor contributions sum (within rounding) to the total score", () => {
    const tasks = [
      {
        _id: oid(10),
        status: "todo",
        priority: "high",
        dueDate: inDays(-1),
        estimatedHours: 8,
        actualHours: 0,
        assignees: [oid(1)],
      },
      {
        _id: oid(11),
        status: "in_progress",
        priority: "medium",
        dueDate: inDays(5),
        estimatedHours: 4,
        actualHours: 0,
        assignees: [oid(1)],
      },
    ];
    const out = scoreProjectRisk({
      project,
      tasks,
      velocity: { completedLast7d: 0, completedPrev7d: 1 },
      now: FIXED_NOW,
    });
    const sum = out.factors.reduce((a, f) => a + f.contribution, 0);
    expect(Math.abs(sum - out.score)).toBeLessThan(0.5);
  });
});

describe("suggestRebalance", () => {
  it("emits no suggestion when active task count is below the noise floor", () => {
    const project = {
      _id: oid(1),
      members: [
        { _id: oid(1), name: "Alice" },
        { _id: oid(2), name: "Bob" },
      ],
    };
    const tasks = [
      {
        _id: oid(10),
        title: "T1",
        status: "todo",
        priority: "medium",
        actualHours: 0,
        assignees: [{ _id: oid(1), name: "Alice" }],
      },
    ];
    const out = suggestRebalance({ project, tasks });
    expect(out).toEqual([]);
  });

  it("suggests reassigning a movable task from the over-loaded user to the most-headroom user", () => {
    const project = {
      _id: oid(1),
      members: [
        { _id: oid(1), name: "Alice" },
        { _id: oid(2), name: "Bob" },
        { _id: oid(3), name: "Carol" },
      ],
    };
    const aliceLoaded = Array.from({ length: 6 }, (_, i) => ({
      _id: oid(10 + i),
      title: `Alice-${i}`,
      status: i < 4 ? "in_progress" : "todo", // last two are movable
      priority: "high",
      actualHours: i < 4 ? 1 : 0,
      assignees: [{ _id: oid(1), name: "Alice" }],
    }));
    const bobLight = [
      {
        _id: oid(20),
        title: "Bob-1",
        status: "in_progress",
        priority: "low",
        actualHours: 0,
        assignees: [{ _id: oid(2), name: "Bob" }],
      },
    ];

    const out = suggestRebalance({
      project,
      tasks: [...aliceLoaded, ...bobLight],
      completedLast30dByUser: new Map([[oid(3), 4]]),
    });

    expect(out.length).toBeGreaterThan(0);
    expect(out[0].fromUserName).toBe("Alice");
    // Carol has 0 load, ergo more headroom than Bob — should be picked first
    expect(out[0].toUserName).toBe("Carol");
  });
});
