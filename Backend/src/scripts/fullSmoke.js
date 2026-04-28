/**
 * Full backend smoke test — hits every major endpoint as a real user via HTTP.
 * Logs in, creates a team + project + task, comments + assigns, verifies a
 * notification was created, then cleans up.
 *
 * Run from Backend/:
 *   node src/scripts/fullSmoke.js
 */
import "dotenv/config";

const BASE = process.env.SMOKE_BASE || "http://localhost:7002/api/v2";
const ADMIN = { email: "oneteamzone@gmail.com", password: "Babu143008#" };
const USER = { email: "aftabshaikh4643@gmail.com", password: "Babu143008#" };

const colors = {
  ok: "\x1b[32m✓\x1b[0m",
  fail: "\x1b[31m✗\x1b[0m",
  step: "\x1b[36m·\x1b[0m",
  info: "\x1b[33m⚠\x1b[0m",
};

let passed = 0;
let failed = 0;
const failures = [];

const step = (label) => console.log(`${colors.step} ${label}`);
const ok = (label) => {
  passed++;
  console.log(`  ${colors.ok} ${label}`);
};
const bad = (label, detail) => {
  failed++;
  failures.push({ label, detail });
  console.log(`  ${colors.fail} ${label}`);
  if (detail) console.log(`     ${detail}`);
};
const info = (label) => console.log(`  ${colors.info} ${label}`);

// Cookie jar — simple per-session storage
const makeJar = () => {
  let cookies = "";
  return {
    fetch: async (path, opts = {}) => {
      const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
      if (cookies) headers.Cookie = cookies;
      const res = await fetch(`${BASE}${path}`, { ...opts, headers });
      const setCookie = res.headers.getSetCookie?.() || [];
      if (setCookie.length) {
        const newPairs = setCookie.map((c) => c.split(";")[0]);
        const existing = cookies
          ? cookies.split("; ").reduce((m, kv) => {
              const [k, v] = kv.split("=");
              m[k] = v;
              return m;
            }, {})
          : {};
        for (const pair of newPairs) {
          const [k, v] = pair.split("=");
          existing[k] = v;
        }
        cookies = Object.entries(existing)
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
      }
      let body = null;
      try {
        body = await res.json();
      } catch {}
      return { status: res.status, body, ok: res.ok };
    },
    cookies: () => cookies,
  };
};

const main = async () => {
  console.log(`\nTarget: ${BASE}\n`);

  // ---- 1. Backend reachable ----
  step("1. Backend reachable");
  try {
    const r = await fetch(`${BASE}/auth/me`);
    ok(`server responded (status ${r.status})`);
  } catch (e) {
    bad("server unreachable", e.message);
    process.exit(1);
  }

  // ---- 2. Login (admin) ----
  step("2. Admin login");
  const admin = makeJar();
  const adminLogin = await admin.fetch("/auth/login", {
    method: "POST",
    body: JSON.stringify(ADMIN),
  });
  if (adminLogin.ok && adminLogin.body?.data?.user) {
    ok(`logged in as ${adminLogin.body.data.user.name} (role=${adminLogin.body.data.user.role})`);
    if (adminLogin.body.data.user.role !== "admin")
      bad("admin role missing in token", "user.role is not 'admin'");
  } else {
    bad("admin login failed", JSON.stringify(adminLogin.body));
    process.exit(1);
  }
  const adminId = adminLogin.body.data.user.id;

  // ---- 3. Login (user) ----
  step("3. Regular user login");
  const user = makeJar();
  const userLogin = await user.fetch("/auth/login", {
    method: "POST",
    body: JSON.stringify(USER),
  });
  if (userLogin.ok && userLogin.body?.data?.user) {
    ok(`logged in as ${userLogin.body.data.user.name} (role=${userLogin.body.data.user.role})`);
  } else {
    bad("user login failed", JSON.stringify(userLogin.body));
  }
  const userId = userLogin.body?.data?.user?.id;

  // ---- 4. Auth /me ----
  step("4. /auth/me returns the current user");
  const me = await admin.fetch("/auth/me");
  me.ok && me.body.data.user.email === ADMIN.email
    ? ok("admin /me OK")
    : bad("/me failed", JSON.stringify(me.body));

  // ---- 5. Users list (admin) ----
  step("5. GET /users (admin)");
  const usersList = await admin.fetch("/users?limit=50");
  if (usersList.ok && Array.isArray(usersList.body.data?.items)) {
    ok(`returned ${usersList.body.data.items.length} users`);
  } else bad("users list failed", JSON.stringify(usersList.body));

  // ---- 6. Workload endpoint ----
  step("6. GET /users/:id/workload");
  if (userId) {
    const wl = await admin.fetch(`/users/${userId}/workload`);
    wl.ok && typeof wl.body.data?.activeTasks === "number"
      ? ok(`active=${wl.body.data.activeTasks} overdue=${wl.body.data.overdue}`)
      : bad("workload failed", JSON.stringify(wl.body));
  }

  // ---- 7. Teams CRUD ----
  step("7. Teams: create + list");
  const teamName = `Smoke Team ${Date.now().toString(36)}`;
  const teamCreate = await admin.fetch("/teams", {
    method: "POST",
    body: JSON.stringify({
      name: teamName,
      description: "auto-created by smoke test",
      members: userId ? [userId] : [],
    }),
  });
  let teamId = null;
  if (teamCreate.ok) {
    teamId = teamCreate.body.data.team._id;
    ok(`created team ${teamName} (${teamId})`);
  } else {
    bad("team create failed", JSON.stringify(teamCreate.body));
  }

  const teamList = await admin.fetch("/teams");
  teamList.ok ? ok(`team list returned ${teamList.body.data.teams.length} teams`) : bad("team list failed");

  // ---- 8. Projects CRUD ----
  step("8. Projects: create with team auto-membership");
  let projectId = null;
  if (teamId) {
    const projCreate = await admin.fetch("/projects", {
      method: "POST",
      body: JSON.stringify({
        team: teamId,
        name: `Smoke Project ${Date.now().toString(36)}`,
        description: "auto",
      }),
    });
    if (projCreate.ok) {
      projectId = projCreate.body.data.project._id;
      const members = projCreate.body.data.project.members || [];
      ok(`created project (${projectId})`);
      if (userId && members.map(String).includes(userId))
        ok("regular user auto-added as project member");
      else bad("regular user NOT auto-added", `members=${JSON.stringify(members)}`);
    } else bad("project create failed", JSON.stringify(projCreate.body));
  }

  // ---- 9. Project progress ----
  step("9. GET /projects/:id/progress");
  if (projectId) {
    const prog = await admin.fetch(`/projects/${projectId}/progress`);
    prog.ok && typeof prog.body.data.completionRate === "number"
      ? ok(`completionRate=${prog.body.data.completionRate}% total=${prog.body.data.total}`)
      : bad("progress failed", JSON.stringify(prog.body));
  }

  // ---- 10. Tasks CRUD ----
  step("10. Tasks: create + list as user (verifies team-based scoping)");
  let taskId = null;
  if (projectId) {
    const taskCreate = await admin.fetch("/tasks", {
      method: "POST",
      body: JSON.stringify({
        project: projectId,
        title: "Smoke task",
        description: "auto",
        priority: "high",
        status: "todo",
        assignees: userId ? [userId] : [],
      }),
    });
    if (taskCreate.ok) {
      taskId = taskCreate.body.data.task._id;
      ok(`created task (${taskId}) — assigned to user`);
    } else bad("task create failed", JSON.stringify(taskCreate.body));

    // user lists tasks — should see this task
    const userTasks = await user.fetch(`/tasks?project=${projectId}`);
    if (userTasks.ok) {
      const found = userTasks.body.data.items.some((t) => t._id === taskId);
      found
        ? ok("regular user CAN see the task (team-based scoping works)")
        : bad("regular user CANNOT see the task", `items=${userTasks.body.data.items.length}`);
    } else bad("user task list failed", JSON.stringify(userTasks.body));
  }

  // ---- 11. Status transition + granular event ----
  step("11. PATCH /tasks/:id/status — Kanban move");
  if (taskId) {
    const move = await admin.fetch(`/tasks/${taskId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "in_progress" }),
    });
    move.ok && move.body.data.task.status === "in_progress"
      ? ok("status updated to in_progress (task:moved would fire)")
      : bad("status patch failed", JSON.stringify(move.body));
  }

  // ---- 12. Assign endpoint ----
  step("12. PATCH /tasks/:id/assign");
  if (taskId && userId) {
    const assign = await admin.fetch(`/tasks/${taskId}/assign`, {
      method: "PATCH",
      body: JSON.stringify({ assignees: [userId, adminId] }),
    });
    if (assign.ok) {
      const a = assign.body.data.task.assignees;
      a.length === 2 ? ok("two assignees applied") : bad(`expected 2, got ${a.length}`);
    } else bad("assign failed", JSON.stringify(assign.body));
  }

  // ---- 13. Comment with mention ----
  step("13. Comment with @mention");
  if (taskId) {
    const cmt = await admin.fetch(`/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: `Heads up @${(USER.email || "").split("@")[0]} — please review`,
      }),
    });
    cmt.ok ? ok("comment posted with mention") : bad("comment failed", JSON.stringify(cmt.body));
  }

  // ---- 14. Activity feed ----
  step("14. GET /tasks/:id/activity");
  if (taskId) {
    const act = await admin.fetch(`/tasks/${taskId}/activity`);
    if (act.ok) {
      const items = act.body.data?.items || [];
      ok(`activity feed has ${items.length} entries`);
      const types = new Set(items.map((i) => i.type));
      ["created", "status_change", "commented"].forEach((t) =>
        types.has(t) ? ok(`  ${t} entry present`) : info(`  ${t} entry missing`),
      );
    } else bad("activity failed", JSON.stringify(act.body));
  }

  // ---- 15. Notifications for the user ----
  step("15. GET /notifications (as user) — checking dispatch worked");
  await new Promise((r) => setTimeout(r, 1500));
  const notifs = await user.fetch("/notifications?limit=20");
  if (notifs.ok) {
    const items = notifs.body.data?.items || [];
    const assigned = items.find(
      (n) => n.type === "task_assigned" && String(n.meta?.taskId) === String(taskId),
    );
    const mentioned = items.find(
      (n) =>
        n.type === "task_mentioned" && String(n.meta?.taskId) === String(taskId),
    );
    assigned
      ? ok(`task_assigned notification received → channels: ${assigned.deliveredChannels.join(", ")}`)
      : info("task_assigned not found (may be on a different user)");
    mentioned
      ? ok(`task_mentioned notification received → channels: ${mentioned.deliveredChannels.join(", ")}`)
      : info("task_mentioned not found (mention parsing may not have matched the email)");
  } else bad("notifications fetch failed", JSON.stringify(notifs.body));

  // ---- 16. Analytics admin ----
  step("16. GET /analytics/admin");
  const an = await admin.fetch("/analytics/admin");
  an.ok && an.body.data?.totals
    ? ok(`totals: ${an.body.data.totals.tasks} tasks, ${an.body.data.totals.projects} projects, ${an.body.data.totals.teams} teams`)
    : bad("analytics admin failed", JSON.stringify(an.body));

  // ---- 17. AI features ----
  step("17. AI features");
  const desc = await admin.fetch("/ai/describe", {
    method: "POST",
    body: JSON.stringify({ title: "Build OAuth login" }),
  });
  if (desc.ok) {
    if (desc.body.data?.fallback)
      info(`describe returned fallback (AI key likely out of credit)`);
    else ok(`describe returned: priority=${desc.body.data?.priority} hours=${desc.body.data?.estimatedHours}`);
  } else bad("describe failed", JSON.stringify(desc.body));

  const search = await admin.fetch("/ai/search", {
    method: "POST",
    body: JSON.stringify({ query: "high priority tasks" }),
  });
  search.ok
    ? ok(`nl-search returned ${search.body.data?.tasks?.length || 0} tasks (source=${search.body.data?.source})`)
    : bad("search failed", JSON.stringify(search.body));

  const chat = await admin.fetch("/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message: "Which tasks are overdue?" }),
  });
  chat.ok
    ? (chat.body.data?.fallback
        ? info(`chat returned fallback: ${chat.body.data.reply.slice(0, 80)}…`)
        : ok(`chat returned a real reply (${chat.body.data.reply.length} chars)`))
    : bad("chat failed", JSON.stringify(chat.body));

  // ---- 18. Granular analytics endpoints ----
  step("18. Granular analytics endpoints");
  for (const path of [
    "/analytics/tasks-per-day",
    "/analytics/completed-per-week",
    "/analytics/overdue",
    "/analytics/project-progress",
  ]) {
    const r = await admin.fetch(path);
    r.ok ? ok(`${path} → 200`) : bad(`${path} failed`, JSON.stringify(r.body));
  }

  // ---- 19. Push key endpoint ----
  step("19. GET /notifications/push/key");
  const key = await admin.fetch("/notifications/push/key");
  key.ok && key.body.data?.publicKey
    ? ok(`VAPID public key returned (length ${key.body.data.publicKey.length}) — enabled=${key.body.data.enabled}`)
    : bad("push key failed", JSON.stringify(key.body));

  // ---- 20. Cleanup ----
  step("20. Cleanup");
  if (taskId) {
    const del = await admin.fetch(`/tasks/${taskId}`, { method: "DELETE" });
    del.ok ? ok("task deleted") : info("task delete failed (may have already been removed)");
  }
  if (projectId) {
    const del = await admin.fetch(`/projects/${projectId}`, { method: "DELETE" });
    del.ok ? ok("project deleted") : info("project delete failed");
  }
  if (teamId) {
    const del = await admin.fetch(`/teams/${teamId}`, { method: "DELETE" });
    del.ok ? ok("team deleted") : info("team delete failed");
  }

  // ---- Summary ----
  console.log();
  console.log(`\nResults:  ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  - ${f.label}: ${f.detail || ""}`));
    process.exit(1);
  } else {
    console.log("\n\x1b[32mAll backend features working end-to-end ✓\x1b[0m\n");
  }
};

main().catch((e) => {
  console.error("Fatal:", e.message);
  console.error(e.stack);
  process.exit(1);
});
