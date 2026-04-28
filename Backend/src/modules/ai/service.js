import TaskModel from "../tasks/task.model.js";
import UserModel from "../users/user.model.js";
import ProjectModel from "../projects/project.model.js";
import TeamModel from "../teams/team.model.js";
import { assertProjectMember } from "../projects/service.js";
import { HttpError } from "../../utils/response.js";
import { escapeRegex } from "../../utils/regex.js";
import { complete, completeJSON, aiAvailable, lastAiError } from "./aiClient.js";
import {
  buildPrompt as buildRecommendationPrompt,
  templateReason as templateRecommendationReason,
} from "./prompts/recommendations.js";

// ---------- Recommendation reasoning ----------
// Internal helper used by the recommendations module to attach a 1-sentence
// "why" string to each scored item. Kept here so all LLM calls flow through
// the single ai/aiClient.js chokepoint (rate limits, fallback, provider swap).
//
// kind: "next_task" | "project_risk" | "rebalance"
// payload: structured factor/score data from the matching scorer
// returns: string (always — falls back to a deterministic template on any failure)
export const reasonRecommendation = async ({ kind, payload }) => {
  const fallback = () => templateRecommendationReason({ kind, payload });
  if (!aiAvailable()) return fallback();

  const built = buildRecommendationPrompt({ kind, payload });
  if (!built) return fallback();

  const json = await completeJSON({
    system: built.system,
    prompt: built.prompt,
    maxTokens: 220,
  });
  const reason = typeof json?.reason === "string" ? json.reason.trim() : "";
  if (!reason) return fallback();
  // Hard-cap length so a verbose model can't bloat the UI.
  return reason.length > 240 ? `${reason.slice(0, 237)}…` : reason;
};

// ---------- Describe ----------
export const describeTask = async ({ title, context = "" }) => {
  if (!aiAvailable()) {
    return {
      description: "",
      priority: "medium",
      estimatedHours: 2,
      fallback: true,
    };
  }
  const json = await completeJSON({
    system:
      "You are a senior engineering manager helping write clear, actionable task descriptions.",
    prompt: `Expand the following task title into a concise description (2–4 sentences), suggest a priority (low|medium|high|urgent), and estimate the effort in hours as an integer.
Return JSON: {"description":"…","priority":"medium","estimatedHours":4}

Title: ${title}
${context ? `Extra context: ${context}` : ""}`,
  });
  if (!json) {
    return {
      description: "",
      priority: "medium",
      estimatedHours: 2,
      fallback: true,
    };
  }
  return {
    description: json.description || "",
    priority: ["low", "medium", "high", "urgent"].includes(json.priority)
      ? json.priority
      : "medium",
    estimatedHours: Number(json.estimatedHours) || 2,
    fallback: false,
  };
};

// ---------- Subtasks ----------
export const suggestSubtasks = async ({ title, description = "" }) => {
  if (!aiAvailable()) return { subtasks: [], fallback: true };
  const json = await completeJSON({
    system:
      "You break engineering work into small, atomic subtasks. Each is an imperative short sentence (<12 words).",
    prompt: `Break this work into 3–7 concrete subtasks. Return JSON: {"subtasks":["…","…"]}

Title: ${title}
Description: ${description}`,
  });
  const arr = Array.isArray(json?.subtasks) ? json.subtasks : [];
  return { subtasks: arr.filter((s) => typeof s === "string"), fallback: !arr.length };
};

// ---------- Suggest assignee ----------
// Heuristic: for each candidate user, compute
//   score = (1 / (activeLoad + 1))                  // workload — least busy wins
//         * (1 + completedLast30d / 5)              // throughput — fast finishers
//         * (1 + relevanceScore)                    // experience — tag overlap
//
// Higher is better. Optionally LLM rerank with short reasons.
//
// `relevanceScore` is the jaccard similarity between the current task's tags
// and the union of tags from the candidate's recent (30d) work. When the
// current task has no tags, the factor degrades to a multiplier of 1 (i.e.
// no effect) so the previous workload-only behaviour is preserved.
const jaccard = (a, b) => {
  const A = new Set(a || []);
  const B = new Set(b || []);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
};

export const suggestAssignee = async ({ taskId }, user) => {
  const task = await TaskModel.findById(taskId).populate("project");
  if (!task) throw new HttpError(404, "Task not found");
  const project = await assertProjectMember(task.project, user);

  const memberIds = project.members.map(String);
  if (!memberIds.length) return { ranked: [] };

  const taskTags = (task.tags || []).map((t) => String(t).toLowerCase());

  const [loads, completions, recentTags, users] = await Promise.all([
    TaskModel.aggregate([
      {
        $match: {
          project: task.project,
          assignees: { $in: project.members },
          status: { $nin: ["completed", "archived"] },
        },
      },
      { $unwind: "$assignees" },
      { $group: { _id: "$assignees", count: { $sum: 1 } } },
    ]),
    TaskModel.aggregate([
      {
        $match: {
          project: task.project,
          assignees: { $in: project.members },
          status: "completed",
          completionDate: {
            $gte: new Date(Date.now() - 30 * 86_400_000),
          },
        },
      },
      { $unwind: "$assignees" },
      { $group: { _id: "$assignees", completed: { $sum: 1 } } },
    ]),
    // Tags of every recent (30d) task each candidate has worked on (across
    // all projects, not just this one — experience transfers). Empty when
    // the task has no tags itself.
    taskTags.length === 0
      ? Promise.resolve([])
      : TaskModel.aggregate([
          {
            $match: {
              assignees: { $in: project.members },
              tags: { $in: taskTags },
              updatedAt: {
                $gte: new Date(Date.now() - 30 * 86_400_000),
              },
            },
          },
          { $unwind: "$assignees" },
          {
            $group: {
              _id: "$assignees",
              tags: { $addToSet: "$tags" },
            },
          },
        ]),
    UserModel.find({ _id: { $in: project.members } }).select("name email avatar"),
  ]);

  const loadMap = Object.fromEntries(loads.map((l) => [String(l._id), l.count]));
  const compMap = Object.fromEntries(
    completions.map((c) => [String(c._id), c.completed]),
  );
  // Flatten the [[tag,...],[tag,...]] arrays-of-arrays into one set per user.
  const tagsByUser = new Map();
  for (const row of recentTags) {
    const flat = new Set();
    for (const sub of row.tags || []) {
      for (const t of sub || []) flat.add(String(t).toLowerCase());
    }
    tagsByUser.set(String(row._id), [...flat]);
  }

  const ranked = users
    .map((u) => {
      const load = loadMap[String(u._id)] || 0;
      const completed = compMap[String(u._id)] || 0;
      const relevance = jaccard(taskTags, tagsByUser.get(String(u._id)) || []);
      const score =
        (1 / (load + 1)) * (1 + completed / 5) * (1 + relevance);
      return {
        userId: u._id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        activeLoad: load,
        completedLast30d: completed,
        relevance: Number(relevance.toFixed(3)),
        score: Number(score.toFixed(4)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // optional LLM rerank with reasons
  if (aiAvailable() && ranked.length > 1) {
    const context = {
      task: { title: task.title, description: task.description || "" },
      candidates: ranked.map((r) => ({
        name: r.name,
        activeLoad: r.activeLoad,
        completedLast30d: r.completedLast30d,
      })),
    };
    const json = await completeJSON({
      system:
        "You help pick the best assignee for a task based on workload, recent throughput, and task-skill fit.",
      prompt: `Given this task and candidates, return a ranking with short reasons.
Return JSON: {"ranked":[{"name":"…","reason":"…"}, …]}

Data:
${JSON.stringify(context, null, 2)}`,
      maxTokens: 500,
    });
    if (json?.ranked) {
      const reasonByName = Object.fromEntries(
        json.ranked.map((r) => [r.name, r.reason]),
      );
      for (const r of ranked) r.reason = reasonByName[r.name];
      // stable-sort preserving LLM order when reason present
      const order = json.ranked.map((r) => r.name);
      ranked.sort(
        (a, b) => order.indexOf(a.name) - order.indexOf(b.name),
      );
    }
  }

  return { ranked };
};

// ---------- Natural-language search ----------
// Rule-based parser first; LLM fallback produces same shape.
const FILTER_SCHEMA_HINT = `{
  "status": "backlog|todo|in_progress|in_review|blocked|completed|archived (optional)",
  "priority": "low|medium|high|urgent (optional)",
  "assigneeEmail": "user email if mentioned (optional)",
  "dueBefore": "ISO date (optional)",
  "dueAfter": "ISO date (optional)",
  "overdue": "true if query mentions overdue (optional)",
  "q": "free-text keywords (optional)"
}`;

// Words people use to express each priority. "high priority" colloquially
// covers both 'high' and 'urgent', so we expand to a set when matched.
const PRIORITY_SYNONYMS = {
  urgent: ["urgent"],
  high: ["high", "urgent"], // "high priority" usually includes urgent in conversation
  medium: ["medium"],
  low: ["low"],
};

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "show",
  "me",
  "my",
  "find",
  "get",
  "all",
  "any",
  "task",
  "tasks",
  "items",
  "priority",
  "due",
  "with",
  "of",
  "for",
  "to",
  "from",
  "and",
  "or",
  "in",
  "is",
]);

const ruleBasedParse = (query) => {
  const q = query.toLowerCase();
  const out = {};
  if (/overdue/.test(q)) out.overdue = true;

  const prio = q.match(/\b(low|medium|high|urgent)\b/);
  if (prio) {
    const expanded = PRIORITY_SYNONYMS[prio[1]] || [prio[1]];
    out.priority = expanded.length === 1 ? expanded[0] : { $in: expanded };
  }

  const status = q.match(
    /\b(backlog|todo|in[\s-]?progress|in[\s-]?review|blocked|completed|archived)\b/,
  );
  if (status) out.status = status[1].replace(/[\s-]/g, "_");

  if (/due\s+today/.test(q)) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    out.dueAfter = start.toISOString();
    out.dueBefore = end.toISOString();
  }
  if (/due\s+tomorrow/.test(q)) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() + 1);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    out.dueAfter = start.toISOString();
    out.dueBefore = end.toISOString();
  }
  if (/this\s+week/.test(q)) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    out.dueAfter = start.toISOString();
    out.dueBefore = end.toISOString();
  }

  // Anything left over that wasn't a stop word / priority / status becomes
  // free-text we'll match against title/description.
  const tokens = q
    .replace(/[.,;:!?]/g, " ")
    .split(/\s+/)
    .filter(
      (t) =>
        t &&
        !STOPWORDS.has(t) &&
        !/^(low|medium|high|urgent)$/.test(t) &&
        !/^(backlog|todo|in_progress|in_review|blocked|completed|archived)$/.test(
          t.replace(/[\s-]/g, "_"),
        ) &&
        !/^(today|tomorrow|week|overdue)$/.test(t),
    );
  if (tokens.length) out.q = tokens.join(" ");
  return out;
};

// `escapeRegex` lives in utils/regex.js — imported above. Keep all callers on
// the same implementation so a future fix only has to land in one place.

// Translate structured filter into TaskModel query
export const filterToQuery = async (filter, user) => {
  const q = {};
  if (filter.status) q.status = filter.status;
  if (filter.priority) q.priority = filter.priority;
  if (filter.assigneeEmail) {
    const u = await UserModel.findOne({ email: filter.assigneeEmail }).select("_id");
    if (u) q.assignees = u._id;
  }
  if (filter.overdue) {
    q.dueDate = { ...(q.dueDate || {}), $lt: new Date() };
    q.status = { $nin: ["completed", "archived"] };
  }
  if (filter.dueBefore) {
    q.dueDate = { ...(q.dueDate || {}), $lt: new Date(filter.dueBefore) };
  }
  if (filter.dueAfter) {
    q.dueDate = { ...(q.dueDate || {}), $gte: new Date(filter.dueAfter) };
  }
  if (filter.q) {
    const safe = escapeRegex(filter.q);
    q.$or = [
      { title: { $regex: safe, $options: "i" } },
      { description: { $regex: safe, $options: "i" } },
    ];
  }

  // Scope by project access for non-admins. A user can see a project if they
  // are an explicit member OR a member/lead of the owning team. (Mirrors the
  // logic in tasks/service.js listTasks.)
  if (user.role !== "admin") {
    const userTeams = await TeamModel.find({
      $or: [{ lead: user.id }, { members: user.id }],
    }).select("_id");
    const teamIds = userTeams.map((t) => t._id);
    const projects = await ProjectModel.find({
      $or: [{ members: user.id }, { team: { $in: teamIds } }],
    }).select("_id");
    q.project = { $in: projects.map((p) => p._id) };
  }
  return q;
};

export const nlSearch = async ({ query }, user) => {
  let filter = ruleBasedParse(query);
  let source = "rules";

  if (aiAvailable()) {
    const today = new Date();
    const isoToday = today.toISOString().slice(0, 10);
    const ai = await completeJSON({
      system:
        "You translate natural-language task queries into a structured filter. Unknown fields omitted. " +
        `Today's date is ${isoToday}. Compute dueBefore/dueAfter relative to today.`,
      prompt: `Schema:
${FILTER_SCHEMA_HINT}

Query: ${JSON.stringify(query)}
Return JSON matching the schema above.`,
      maxTokens: 400,
    });
    if (ai && typeof ai === "object") {
      filter = { ...filter, ...ai };
      source = "ai";
    }
  }

  // After the AI merge, re-expand priority synonyms. The AI tends to flatten
  // "high priority" → "high", but conversationally that should also include
  // urgent. Use $in so Mongo matches either.
  if (typeof filter.priority === "string") {
    const expanded = PRIORITY_SYNONYMS[filter.priority];
    if (expanded && expanded.length > 1) {
      filter.priority = { $in: expanded };
    }
  }

  const mongoQuery = await filterToQuery(filter, user);
  let tasks = await TaskModel.find(mongoQuery)
    .sort({ priority: 1, dueDate: 1 })
    .limit(100)
    .populate("assignees", "name email avatar")
    .populate("project", "name slug");

  // If the structured filter found nothing but the user typed something
  // searchable, drop the structured constraints and try a pure text search
  // across title/description so the user gets *something* back when their
  // phrasing didn't match a recognised priority/status (e.g. "high priority
  // task" when only `urgent` and `medium` exist).
  if (tasks.length === 0 && query && query.trim().length >= 2) {
    const safe = escapeRegex(query.trim());
    const fallbackQuery = {
      $or: [
        { title: { $regex: safe, $options: "i" } },
        { description: { $regex: safe, $options: "i" } },
        { tags: { $in: [new RegExp(safe, "i")] } },
      ],
    };
    if (user.role !== "admin") {
      const userTeams = await TeamModel.find({
        $or: [{ lead: user.id }, { members: user.id }],
      }).select("_id");
      const teamIds = userTeams.map((t) => t._id);
      const projects = await ProjectModel.find({
        $or: [{ members: user.id }, { team: { $in: teamIds } }],
      }).select("_id");
      fallbackQuery.project = { $in: projects.map((p) => p._id) };
    }
    const textHits = await TaskModel.find(fallbackQuery)
      .sort({ priority: 1, dueDate: 1 })
      .limit(50)
      .populate("assignees", "name email avatar")
      .populate("project", "name slug");
    if (textHits.length) {
      tasks = textHits;
      source = `${source}+text-fallback`;
    }
  }

  return { filter, tasks, source };
};

// ---------- Conversational assistant ----------

const truncateList = (arr, n) => (arr.length > n ? arr.slice(0, n) : arr);

const buildAssistantContext = async (user) => {
  const now = new Date();
  const isAdmin = user.role === "admin";

  const taskScope = isAdmin
    ? {}
    : {
        $or: [
          { assignees: user.id },
          {
            project: {
              $in: (
                await ProjectModel.find({ members: user.id }).select("_id")
              ).map((p) => p._id),
            },
          },
        ],
      };

  const [overdue, dueSoon, myActive, projects, workloadByUser] =
    await Promise.all([
      TaskModel.find({
        ...taskScope,
        dueDate: { $lt: now },
        status: { $nin: ["completed", "archived"] },
      })
        .select("title status priority dueDate assignees project")
        .limit(15)
        .populate("assignees", "name")
        .populate("project", "name"),
      TaskModel.find({
        ...taskScope,
        dueDate: { $gte: now, $lt: new Date(now.getTime() + 3 * 86_400_000) },
        status: { $nin: ["completed", "archived"] },
      })
        .select("title status priority dueDate assignees project")
        .limit(15)
        .populate("assignees", "name")
        .populate("project", "name"),
      TaskModel.find({
        assignees: user.id,
        status: { $nin: ["completed", "archived"] },
      })
        .select("title status priority dueDate project")
        .limit(20)
        .populate("project", "name"),
      ProjectModel.find(isAdmin ? {} : { members: user.id })
        .select("name slug status")
        .limit(20),
      // Active task count per user across the assistant's visible scope.
      // Used to answer "who is the least busy?" / "who is most busy?" without
      // forcing the LLM to count tasks itself.
      TaskModel.aggregate([
        { $match: { ...taskScope, status: { $nin: ["completed", "archived"] } } },
        { $unwind: "$assignees" },
        { $group: { _id: "$assignees", active: { $sum: 1 } } },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            name: "$user.name",
            email: "$user.email",
            active: 1,
          },
        },
        { $sort: { active: -1 } },
        { $limit: 30 },
      ]),
    ]);

  return {
    user: { name: user.name || user.email, role: user.role },
    today: now.toISOString().slice(0, 10),
    overdueTasks: truncateList(
      overdue.map((t) => ({
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        assignees: (t.assignees || []).map((a) => a.name),
        project: t.project?.name,
      })),
      15,
    ),
    tasksDueIn3Days: truncateList(
      dueSoon.map((t) => ({
        title: t.title,
        priority: t.priority,
        dueDate: t.dueDate,
        assignees: (t.assignees || []).map((a) => a.name),
        project: t.project?.name,
      })),
      15,
    ),
    workloadByUser: (workloadByUser || []).filter((w) => w.name),
    myActiveTasks: truncateList(
      myActive.map((t) => ({
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        project: t.project?.name,
      })),
      20,
    ),
    projects: projects.map((p) => ({ name: p.name, status: p.status })),
  };
};

// Detect a task-creation intent ("create a task for fixing login") and emit a
// structured action the frontend can confirm with a button. The assistant never
// creates the task itself — it always asks the user to confirm.
const detectCreateTaskIntent = (message) => {
  const m = message.toLowerCase();
  return /\b(create|add|make|new)\b.*\btask\b/.test(m);
};

const proposeTaskFromMessage = async (message) => {
  if (!aiAvailable()) {
    // best-effort fallback — strip the verb/noun and use the rest as title
    const title = message.replace(
      /^\s*(please\s+)?(create|add|make|new)\s+(a\s+)?task\s*(for|to|about)?\s*/i,
      "",
    );
    return {
      title: title.trim() || "New task",
      description: "",
      priority: "medium",
      estimatedHours: 2,
    };
  }
  const json = await completeJSON({
    system:
      "You turn a short user request into structured task fields. Be concise.",
    prompt: `User request: ${JSON.stringify(message)}
Return JSON: {"title":"…","description":"1-2 sentences","priority":"low|medium|high|urgent","estimatedHours":2}`,
    maxTokens: 300,
  });
  return {
    title: json?.title || "New task",
    description: json?.description || "",
    priority: ["low", "medium", "high", "urgent"].includes(json?.priority)
      ? json.priority
      : "medium",
    estimatedHours: Number(json?.estimatedHours) || 2,
  };
};

export const chat = async ({ message, history = [] }, user) => {
  if (!message || !message.trim()) {
    return { reply: "Ask me anything about your tasks or projects.", fallback: true };
  }

  // Task-creation intent: short-circuit and return a structured action even if
  // the LLM is offline. The frontend renders a "Create this task" confirm button.
  if (detectCreateTaskIntent(message)) {
    const proposed = await proposeTaskFromMessage(message);
    return {
      reply: `Sure — here's a draft. Pick a project and click **Create** to add it.`,
      action: { type: "create_task", task: proposed },
      fallback: !aiAvailable(),
    };
  }

  if (!aiAvailable()) {
    return {
      reply:
        "AI is currently disabled. Set DEEPSEEK_API_KEY in the backend .env to enable the assistant.",
      fallback: true,
    };
  }

  const ctx = await buildAssistantContext(user);
  const recentHistory = Array.isArray(history) ? history.slice(-6) : [];
  const transcript = recentHistory
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const text = await complete({
    system: `You are an in-app assistant for a task management platform.
Use ONLY the data provided in the context to answer.
Be concise (2-4 sentences) and reference task titles and project names when relevant.
If asked to create a task, suggest the title/priority/due date — the user will confirm.
If the data does not contain the answer, say so plainly.`,
    prompt: `Context (JSON):
${JSON.stringify(ctx, null, 2)}

${transcript ? `Recent conversation:\n${transcript}\n\n` : ""}User: ${message.trim()}
Assistant:`,
    maxTokens: 600,
  });

  if (text) return { reply: text, fallback: false };

  // Surface the underlying reason so the user can act (top up balance, fix key, etc.)
  const err = lastAiError();
  let friendly = "I couldn't generate a response. Please try again.";
  if (err) {
    if (/Insufficient Balance/i.test(err)) {
      friendly =
        "The AI provider account is out of credit. Top up at https://platform.deepseek.com to use the assistant.";
    } else if (/401|invalid_api_key|authentication/i.test(err)) {
      friendly =
        "The DEEPSEEK_API_KEY appears invalid. Generate a new key at https://platform.deepseek.com.";
    } else if (/429|rate.?limit/i.test(err)) {
      friendly = "Rate limit reached. Please try again in a moment.";
    } else {
      friendly = `Assistant unavailable: ${err.slice(0, 160)}`;
    }
  }
  return { reply: friendly, fallback: true };
};

// ---------- Delay scoring ----------
// Heuristic-first: compute the risk from due date, priority, status, hours
// overrun, assignee workload, and the assignee's recent estimate-vs-actual
// ratio. When AI is available, additionally generate a one-sentence reason
// the UI can show; the score itself stays deterministic so the rank order
// is stable across calls.

const HRS_DAY_MS = 86_400_000;

const computeAssigneeContext = async (task) => {
  const ids = (task.assignees || []).map((a) => a._id || a);
  if (ids.length === 0) {
    return { workload: 0, speedRatio: null };
  }

  const since = new Date(Date.now() - 30 * HRS_DAY_MS);
  const [activeCounts, recentCompleted] = await Promise.all([
    TaskModel.aggregate([
      {
        $match: {
          assignees: { $in: ids },
          _id: { $ne: task._id },
          status: { $nin: ["completed", "archived"] },
        },
      },
      { $unwind: "$assignees" },
      { $match: { assignees: { $in: ids } } },
      { $group: { _id: "$assignees", count: { $sum: 1 } } },
    ]),
    TaskModel.find({
      assignees: { $in: ids },
      status: "completed",
      completionDate: { $gte: since },
      estimatedHours: { $gt: 0 },
      actualHours: { $gt: 0 },
    })
      .select("estimatedHours actualHours assignees")
      .lean(),
  ]);

  // Average active task count across assignees
  const totalActive = activeCounts.reduce((a, r) => a + r.count, 0);
  const workload = ids.length > 0 ? totalActive / ids.length : 0;

  // Average ratio = mean of actual/estimated across recent completed tasks
  // for this assignee set. >1 means they historically take longer than they
  // estimate; <1 means they're faster.
  let speedRatio = null;
  if (recentCompleted.length > 0) {
    const ratios = recentCompleted.map(
      (t) => Math.max(0.1, t.actualHours / Math.max(0.1, t.estimatedHours)),
    );
    speedRatio =
      ratios.reduce((a, r) => a + r, 0) / ratios.length;
  }

  return { workload: Number(workload.toFixed(2)), speedRatio };
};

export const scoreDelay = async (taskId) => {
  const task = await TaskModel.findById(taskId);
  if (!task) throw new HttpError(404, "Task not found");

  const now = Date.now();
  const factors = [];
  let score = 0;

  if (task.dueDate) {
    const daysLeft = (task.dueDate.getTime() - now) / HRS_DAY_MS;
    let dueScore = 0;
    if (daysLeft < 0) dueScore = 70;
    else if (daysLeft < 1) dueScore = 50;
    else if (daysLeft < 3) dueScore = 25;
    if (dueScore > 0) {
      score += dueScore;
      factors.push({
        name: "dueDate",
        contribution: dueScore,
        detail:
          daysLeft < 0
            ? `${Math.abs(Math.round(daysLeft))}d overdue`
            : `${Math.max(0, Math.round(daysLeft))}d left`,
      });
    }
  }

  if (["urgent", "high"].includes(task.priority)) {
    score += 15;
    factors.push({ name: "priority", contribution: 15, detail: task.priority });
  }

  if (["blocked", "backlog"].includes(task.status)) {
    score += 15;
    factors.push({ name: "status", contribution: 15, detail: task.status });
  }

  if (task.estimatedHours && task.actualHours >= task.estimatedHours) {
    score += 10;
    factors.push({
      name: "hoursOverrun",
      contribution: 10,
      detail: `${task.actualHours}/${task.estimatedHours}h`,
    });
  }

  // New: assignee context (workload + historical speed)
  const ctx = await computeAssigneeContext(task);
  if (ctx.workload >= 8) {
    score += 15;
    factors.push({
      name: "assigneeWorkload",
      contribution: 15,
      detail: `~${ctx.workload} other active tasks`,
    });
  } else if (ctx.workload >= 5) {
    score += 10;
    factors.push({
      name: "assigneeWorkload",
      contribution: 10,
      detail: `~${ctx.workload} other active tasks`,
    });
  } else if (ctx.workload >= 3) {
    score += 5;
    factors.push({
      name: "assigneeWorkload",
      contribution: 5,
      detail: `~${ctx.workload} other active tasks`,
    });
  }

  if (ctx.speedRatio != null) {
    if (ctx.speedRatio >= 1.5) {
      score += 15;
      factors.push({
        name: "historicalSpeed",
        contribution: 15,
        detail: `assignee runs ${Math.round((ctx.speedRatio - 1) * 100)}% over estimate`,
      });
    } else if (ctx.speedRatio >= 1.2) {
      score += 10;
      factors.push({
        name: "historicalSpeed",
        contribution: 10,
        detail: `assignee runs ${Math.round((ctx.speedRatio - 1) * 100)}% over estimate`,
      });
    } else if (ctx.speedRatio >= 1.0) {
      score += 5;
      factors.push({
        name: "historicalSpeed",
        contribution: 5,
        detail: "assignee tends to slip estimates",
      });
    } else {
      // Faster-than-estimate users get a small reduction
      score = Math.max(0, score - 5);
      factors.push({
        name: "historicalSpeed",
        contribution: -5,
        detail: "assignee historically beats estimates",
      });
    }
  }

  // Cap at 100 so the label thresholds are stable
  score = Math.max(0, Math.min(100, score));
  const label = score >= 60 ? "high" : score >= 30 ? "medium" : "low";

  // Optional one-sentence reason from the LLM. Falls back to a templated
  // string built from the highest-contributing factor when unavailable.
  let reason = "";
  if (aiAvailable() && factors.length > 0) {
    const json = await completeJSON({
      system:
        "You explain in one short sentence why a task is at risk of slipping. " +
        "Use the supplied factor scores literally; no apologies; ≤180 chars.",
      prompt: `Task: ${JSON.stringify({
        title: task.title,
        priority: task.priority,
        status: task.status,
        score,
        label,
        factors,
      })}
Return JSON: {"reason":"…"}`,
      maxTokens: 150,
    });
    reason = typeof json?.reason === "string" ? json.reason.trim() : "";
  }
  if (!reason) {
    const top = factors.slice().sort((a, b) => b.contribution - a.contribution)[0];
    reason = top
      ? `${label === "high" ? "High" : label === "medium" ? "Moderate" : "Low"} risk — ${top.name} (${top.detail || top.contribution}).`
      : `Low risk — no concerning signals.`;
  }

  // Atomic write — avoid load-mutate-save so we don't trip Mongoose
  // optimistic-concurrency `VersionError` when something else (a comment,
  // a timer tick, an attachment add) touches the same document between
  // the load above and this write. `$set` on a single nested path is
  // safe to interleave with any other field-level update.
  await TaskModel.updateOne(
    { _id: task._id },
    {
      $set: {
        "aiMeta.delayRisk": { score, label, scoredAt: new Date() },
      },
    },
  );
  return { score, label, factors, reason };
};
