# MERN Task Manager

An enterprise-grade collaboration platform comparable to Jira, Trello, and Asana — built on the MERN + MongoDB Atlas + Upstash Redis + Socket.IO stack.

All endpoints are served under `/api/v2/*`.

---

## Features

- **Teams + Projects** — Admins organise users into teams; tasks live inside projects inside teams.
- **Rich Task workflow** — `backlog → todo → in_progress → in_review → blocked → completed → archived`, priority (low/medium/high/urgent), start/due/completion dates, estimated vs actual hours, dependencies with cycle detection, subtasks via `parent`, tags, position for Kanban ordering.
- **Kanban board** — `@dnd-kit` drag-and-drop across 7 columns. Drops are persisted to the backend and broadcast in real time to all clients viewing the same project via Socket.IO + Redis pub/sub. Granular events: `task:created`, `task:updated`, `task:moved`, `task:deleted`, `comment:added`, `notification:new`.
- **Comments + @mentions** — regex-based mention resolution against the user directory. Mentioned users receive priority notifications across every enabled channel.
- **Activity history** — every task change runs through a single `logEvent` writer that stores to Mongo and publishes to Redis.
- **Notifications** — four delivery channels:
  - **In-app** — live via Socket.IO, badge in the navbar bell.
  - **Email** — Nodemailer (Gmail/SMTP/Ethereal), templated for assignment/mention/overdue/due-soon.
  - **Browser push** — `web-push` + VAPID, service worker handles `push` events and click navigation. Toggle in the bell dropdown.
  - **Slack** — incoming webhook, broadcast for assignment/overdue/due-soon.
- **File attachments** — Cloudinary-backed, multi-file upload per task. Disabled gracefully with a 503 if Cloudinary creds aren't set.
- **Analytics** — admin dashboard with tasks-per-day line chart, priority pie, project completion bars, top contributors, completed-per-week, overdue list. User dashboard with assigned/completed/overdue cards + 7-day productivity line. Mongo aggregations, Redis-cached 60 s.
- **AI features** — powered by **DeepSeek** (OpenAI-compatible API):
  - Auto-description, priority guess, and effort estimate from a short title.
  - Subtask generation inside the task drawer.
  - Smart assignee ranking (heuristic + optional LLM rerank with reasons).
  - Natural-language search ("show overdue high-priority tasks", "tasks due tomorrow").
  - Delay-risk scoring per task.
  - **Conversational assistant** — floating chat widget with project/task context. Ask "Which tasks are overdue?", "Summarize the Admin Dashboard project", "Who is the least busy user?".
  - All AI features fall back to deterministic behaviour when `DEEPSEEK_API_KEY` is missing.
- **Auth + 2FA** — email verification, forgot/reset password with opaque sha256-stored tokens, failed-login lockout (5 attempts → 15-minute lock), refresh-token rotation in Redis, always-success forgot-password to block enumeration, **TOTP 2FA** (`speakeasy` + QR code) with login OTP step, Helmet, strict CORS allowlist, custom Express-5-compatible Mongo-key sanitizer.
- **Modular backend** — `Backend/src/modules/{auth,users,teams,projects,tasks,comments,activity,attachments,notifications,analytics,ai}`, each with its own `model/service/controller/routes/validators`.
- **Docker Compose** for local MongoDB + Redis + backend + frontend.
- **GitHub Actions** CI (lint + smoke tests).

### Tests & coverage (honest numbers)

Backend: **21 tests across 3 suites** — 10 pure-function unit tests (recommendation scorers), 10 API smoke tests (auth gating + zod validation + recommendations endpoints + V1 alias contract), 1 Socket.IO fanout integration test.

Frontend: **3 vitest + React Testing Library smoke tests** — UserDashboard, NotificationBell, NLSearchBar.

Run `npm run test:coverage` in either folder for a fresh number. Most-recent backend `--coverage` run reports:

| Metric | Coverage |
|---|---|
| Statements | ~29% |
| Branches | ~11% |
| Functions | ~14% |
| Lines | ~31% |

The recommendations scorers are **>90%** covered (deterministic, easy to test). The rest of the codebase (services + controllers across 14 modules) is intentionally light — critical-path smoke + integration only, not the spec's aspirational 80%. Closing that gap is mostly about writing more service-level integration tests against `mongodb-memory-server` + a real Redis (or `ioredis-mock`).

### Roadmap

- CSRF double-submit tokens — **shipped** (`Backend/src/middleware/csrf.js`).
- Cypress E2E tests — parked; too heavy for current scope.
- Push to 80% coverage — write service-level integration tests across the modules with the lowest current %.

### V1 ↔ V2 in one app

V1's URL surface (`/auth`, `/tasks`, `/dashboard`, `/api/auth`, `/api/tasks`, etc) is mounted **alongside** V2's canonical `/api/v2/*` paths. Same handlers, same response envelopes — V1-era clients keep working while new clients use V2. The V1 source folders (deleted in the 2026-04-25 cleanup) remain in git history if a strict V1 wire shape is ever needed; the running app exposes both URL prefixes from the V2 modular codebase. Lock-in is enforced by `Backend/src/tests/smoke.test.js` ("V1 alias GET /tasks ..." etc).

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 3, React Router 7, React Query 5, Zustand, React Hook Form + Zod, `@dnd-kit`, Recharts, lucide-react, socket.io-client |
| Backend | Node, Express 5, Mongoose 9, Helmet, Zod, Winston, Nodemailer, Multer, Cloudinary, **`web-push`**, **`speakeasy` + `qrcode`**, JWT, bcrypt |
| Data | MongoDB Atlas, Upstash Redis |
| Realtime | Socket.IO with per-user + per-project rooms, Redis pub/sub bridge |
| AI | **DeepSeek** (OpenAI-compatible REST) — graceful fallback when disabled |
| Tests | Jest + Supertest (smoke) |
| CI/CD | GitHub Actions, Docker Compose |
| Hosting | Vercel (frontend), Render (backend) |

---

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for system diagrams (component layout, realtime pub/sub flow, auth flow, AI flow) rendered in Mermaid.

---

## Quick Start

### 1. Backend

```bash
cd Backend
npm install

cp .env.example .env
# Required: MONGO_URI, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
# Optional: CLOUDINARY_*, SMTP_*, DEEPSEEK_API_KEY, VAPID_*, SLACK_WEBHOOK_URL

npm run server         # nodemon, listens on :7002
```

### 2. Frontend

```bash
cd frontend
npm install

cp .env.example .env   # optional — defaults to http://localhost:7002

npm run dev            # Vite on :5173
```

### 3. Demo flow

1. Register an account (role: admin).
2. Watch the backend console for the email preview URL — click "Verify email" (frontend handles it idempotently, so multiple clicks are safe).
3. Log in → User Dashboard.
4. **Teams** → **+ New team** → fill name + description.
5. **Projects** → **+ New project** → pick the team, name it.
6. Open the project → Kanban board.
7. Click `+` on any column to add a task. Try the "✨ AI suggest" button (requires `DEEPSEEK_API_KEY`).
8. Drag cards between columns — the move persists and broadcasts to every connected client on that project.
9. Click the **bot icon** (bottom-right) to chat with the AI assistant — ask "Which tasks are overdue?" or "What's due in 3 days?".
10. **Bell → Browser push: Enable** to receive desktop notifications even when the tab is in background.
11. **Settings → Two-factor authentication → Enable** to scan a QR code and require an OTP on next sign-in.

### 4. Docker Compose (alternative)

```bash
docker compose up --build
```

Spins up MongoDB, Redis, backend, and frontend in one shot. Env vars live in `docker-compose.yml`.

---

## Project Structure

```
Backend/
├── package.json
├── Dockerfile
├── jest.config.js
├── .env.example
└── src/
    ├── app.js                  # express wiring (mounts /api/v2)
    ├── server.js               # http + Socket.IO + Redis pub/sub bridge
    ├── config/                 # env (zod), db, redis, cloudinary, logger
    ├── middleware/             # security (helmet+cors+sanitize), error, auth, rbac, rateLimit
    ├── utils/                  # token, mailer, logEvent, response, slugify
    ├── scripts/                # one-off maintenance
    ├── tests/smoke.test.js
    └── modules/
        ├── auth/               # register/login/2FA/refresh/verify/reset
        ├── users/              # list/get/update/workload
        ├── teams/              # CRUD + members
        ├── projects/           # CRUD + progress
        ├── tasks/              # CRUD + status/position/assign/priority + dependencies + attachments
        ├── comments/           # CRUD + @mentions
        ├── activity/           # task/project/team activity feed
        ├── attachments/        # Cloudinary upload/delete
        ├── notifications/      # in-app + email + push (web-push) + slack
        │   ├── pushClient.js
        │   ├── pushSubscription.model.js
        │   └── slackClient.js
        ├── analytics/          # admin/user/project + granular series
        └── ai/                 # deepseek client + describe/subtasks/assignee/search/delay/chat

frontend/
├── package.json
├── Dockerfile
├── .env.example
├── public/
│   └── sw.js                  # push notifications service worker
└── src/
    ├── main.jsx / App.jsx
    ├── app/                   # providers, router (mounts AssistantWidget globally)
    ├── lib/                   # queryClient
    ├── shared/
    │   ├── api/               # axios client (401→refresh) + endpoint wrappers
    │   ├── socket/            # socketClient + useSocketEvent hook
    │   └── components/        # Button, Input, Modal, Spinner, Avatar, Badge, Navbar
    ├── store/                 # zustand authStore
    └── features/
        ├── auth/              # Login (with OTP step), Register, Forgot, Reset, Verify
        ├── settings/          # SettingsPage with 2FA wizard
        ├── teams/             # TeamsPage, TeamDetailPage
        ├── projects/          # ProjectsPage, ProjectBoardPage
        ├── kanban/            # KanbanBoard, Column, TaskCard, TaskDrawer, Attachments
        ├── notifications/     # NotificationBell + usePushNotifications
        ├── ai/                # AssistantWidget (floating chat)
        ├── dashboard/         # AdminDashboard, UserDashboard
        └── search/            # NLSearchBar
```

---

## Environment Reference

See [`Backend/.env.example`](Backend/.env.example) and [`frontend/.env.example`](frontend/.env.example) for the authoritative list with inline comments. Every third-party integration is gated:

| Setting | What happens if missing |
|---|---|
| `MONGO_URI` | Server fails to start (env validation) |
| `REDIS_URL` | Server fails to start (env validation) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Server fails to start (min 8 chars) |
| `SMTP_*` | Falls back to an Ethereal test account; preview URLs logged on every send |
| `CLOUDINARY_*` | Attachment routes return 503 |
| `DEEPSEEK_API_KEY` | AI endpoints return deterministic fallback data |
| `VAPID_*` | Push channel skipped silently; bell dropdown still works for in-app |
| `SLACK_WEBHOOK_URL` | Slack channel skipped silently |

### One-time setup helpers

**VAPID keys** (browser push):
```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```
Copy the two keys into `Backend/.env` as `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`. Set `VAPID_CONTACT_EMAIL` to a contact address.

**Slack incoming webhook**:
1. Create a Slack app → enable **Incoming Webhooks** → add a webhook to a channel.
2. Paste the `https://hooks.slack.com/services/...` URL into `SLACK_WEBHOOK_URL`.

**Gmail SMTP**:
1. Enable 2FA on your Google account.
2. Create an App Password at https://myaccount.google.com/apppasswords.
3. Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<app-password>`, `SMTP_FROM="Your App <you@gmail.com>"`.

---

## Scripts

### Backend

| Script | Purpose |
|---|---|
| `npm start` | Boot the server (`src/server.js`) |
| `npm run server` | Dev server with nodemon |
| `npm test` | Smoke suite (Jest + Supertest) |

### Frontend

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview built bundle |
| `npm run lint` | ESLint |

---

## API Reference

Full endpoint list in [`docs/api.md`](docs/api.md). Highlights:

```
# Auth
POST   /api/v2/auth/register
POST   /api/v2/auth/login                 # {email,password,otp?}; returns requires2FA on missing OTP
POST   /api/v2/auth/logout
POST   /api/v2/auth/refresh               # alias: /refresh-token
GET    /api/v2/auth/verify-email/:token   # alias: POST /verify-email {token}
POST   /api/v2/auth/forgot-password
POST   /api/v2/auth/reset-password/:token
POST   /api/v2/auth/2fa-enable            # returns { secret, otpauthUrl, qrDataUrl }
POST   /api/v2/auth/2fa-verify            # { code }
POST   /api/v2/auth/2fa-disable
GET    /api/v2/auth/me

# Users
GET    /api/v2/users
GET    /api/v2/users/:id
PUT    /api/v2/users/:id                  # alias for PATCH (admin)
GET    /api/v2/users/:id/workload

# Teams + Projects
POST   /api/v2/teams
POST   /api/v2/teams/:id/members
POST   /api/v2/projects
GET    /api/v2/projects/:id/progress

# Tasks
GET    /api/v2/tasks?project=&team=&status=&priority=&assignee=&q=
POST   /api/v2/tasks
PATCH  /api/v2/tasks/:id                  # alias: PUT /:id
PATCH  /api/v2/tasks/:id/status           # Kanban column move
PATCH  /api/v2/tasks/:id/assign
PATCH  /api/v2/tasks/:id/priority
POST   /api/v2/tasks/:id/dependencies
GET    /api/v2/tasks/:id/dependencies
POST   /api/v2/tasks/:id/comments
POST   /api/v2/tasks/:id/attachments
GET    /api/v2/tasks/:id/attachments

# Notifications
GET    /api/v2/notifications
PATCH  /api/v2/notifications/:id/read     # alias: POST /:id/read
GET    /api/v2/notifications/push/key
POST   /api/v2/notifications/push/subscribe
POST   /api/v2/notifications/push/unsubscribe

# Analytics
GET    /api/v2/analytics/admin
GET    /api/v2/analytics/user             # alias for /me
GET    /api/v2/analytics/tasks-per-day
GET    /api/v2/analytics/completed-per-week
GET    /api/v2/analytics/overdue
GET    /api/v2/analytics/project-progress

# AI
POST   /api/v2/ai/generate-task           # alias for /describe
POST   /api/v2/ai/subtasks
POST   /api/v2/ai/suggest-assignee
POST   /api/v2/ai/search                  # alias for /nl-search
POST   /api/v2/ai/predict-delay           # alias for /score-delay
POST   /api/v2/ai/chat                    # conversational assistant with task/project context
```

### Socket.IO events

```
# server → client
task:created          # any task added
task:updated          # field changes (assignee/priority/title/etc.)
task:moved            # status change OR position reorder (Kanban)
task:deleted
comment:added
notification:new      # also emitted on user:<id> room
taskUpdated           # legacy generic event, still emitted for backward compat

# client → server
joinProject {projectId}
leaveProject {projectId}
```

---

## Deployment

### Frontend → Vercel

1. Project root: `frontend`
2. Build command: `npm run build`
3. Output dir: `dist`
4. Env vars: `VITE_API_URL=https://your-backend.onrender.com`

### Backend → Render

1. Root directory: `Backend`
2. Build command: `npm install`
3. Start command: `npm start`
4. Env vars: copy every key from `Backend/.env.example` and fill. Don't forget `CLIENT_ORIGIN` + `CORS_ALLOWLIST` = your Vercel URL.
5. Ensure the instance has an Upstash Redis URL and a MongoDB Atlas URI.
6. **For browser push in production**: VAPID requires HTTPS — Render gives you that automatically.

### Continuous integration

`.github/workflows/ci.yml` runs on every push/PR:

1. `npm ci` in both Backend and frontend.
2. `npm run lint` on the frontend.
3. `npm test` on the backend (smoke).

---

## Security Posture

| Threat | Mitigation |
|---|---|
| Credential stuffing | Lockout after 5 failed logins (15-minute block) |
| Session theft | httpOnly + SameSite=Strict cookies, refresh-token rotation in Redis |
| Account takeover | Optional TOTP 2FA on every login |
| Mongo operator injection | Custom in-place sanitizer that strips `$` and `.` from request keys (Express 5-compatible — `express-mongo-sanitize` is broken on Express 5) |
| Email enumeration | Forgot-password always returns success regardless of account existence |
| XSS | React escapes by default; no `dangerouslySetInnerHTML` |
| CSRF | Mitigated by `SameSite=Strict` cookies + strict CORS allowlist (full double-submit tokens on roadmap) |
| Privilege escalation | RBAC middleware (`adminOnly`, `canEditTask`); 2FA secret stored `select: false` |
| Brute-force on AI/login | Per-route rate limiting via `express-rate-limit` |

---

## License

MIT










# Enterprise Task Management Platform (MERN Stack) – Version 2


# Overview
This project is an advanced Enterprise Work Management Platform built using the MERN stack (MongoDB, Express.js, React.js, Node.js). It is an evolution of a basic task management system into a scalable, collaborative platform inspired by tools like Jira, Trello, and Asana.
Version 2 significantly enhances the system by introducing team collaboration, project structuring, real-time updates, AI-powered insights, advanced analytics, and enterprise-grade security.


# Tech Stack

# Frontend

React.js
Tailwind CSS 
Socket.IO Client


# Backend

Node.js + Express.js
MongoDB Atlas
Redis (Upstash)
Socket.IO
DevOps & Tools
Vercel (Frontend Deployment)
Render / Railway (Backend Deployment)
GitHub Actions (CI/CD)
Docker (Containerization)


# Testing
Jest
Supertest
React Testing Library
Cypress



🏗️ System Architecture
The backend is modular and follows a scalable architecture:
src/ ├── modules/ │ ├── auth/ │ ├── users/ │   ├── teams/ │   ├── projects/ │   ├── tasks/ │   ├── notifications/ │   ├── analytics/ │   ├── ai/ ├── config/ ├── middleware/ ├── utils/ └── server.js

# Key Features

 Team & Project Management
Create multiple teams (Engineering, Marketing, HR, etc.)
Assign users to one or more teams
Create multiple projects under each team
Tasks are structured under projects (not global)

# Advanced Task Management
Each task supports:
Status workflow:
Backlog → Todo → In Progress → In Review → Blocked → Completed → Archived
Priority levels (Low, Medium, High)
Estimated vs actual hours
Start, due, and completion dates
Task dependencies (blocking tasks)


# Kanban Board (Drag & Drop)
Visual task management using columns
Drag-and-drop task updates
Real-time updates via Socket.IO


# Filters:
Team
Project
Assignee
Status
Priority

# Collaboration System
Task comments & notes
@mentions for users
Activity history tracking:
Task creation
Assignment changes
Status updates
Comments
Completion logs


# 🔔 Notification System
Users receive notifications for:
Task assignment
Status changes
Comments & mentions
Due date reminders
Overdue alerts

# Notification channels:

In-app notifications
Email notifications
Browser push notifications
(Optional: Slack integration)

# 📎 File Attachments
Upload files (images, PDFs, documents)
Multiple attachments per task
Preview & download support
Storage via Cloudinary / UploadThing


# 📈 Advanced Dashboards
Admin Dashboard
Tasks created per day
Weekly completion trends
Overdue tasks
Project completion percentage
Priority distribution
Top-performing users/teams
User Dashboard
Assigned tasks
Completed tasks
Overdue tasks
Weekly workload
Productivity insights



# 🤖 AI-Powered Features
1. Smart Task Generation
Auto-generate:
Description
Priority
Difficulty
Subtasks

Example:

“Build login page” → generates UI, validation, API integration, JWT handling, testing


2. Smart Assignment

Suggests best user based on:
Workload
Past performance
Task completion speed
Skill relevance

3. Natural Language Search
Users can search like:
“Show overdue high priority tasks”
“Rahul’s completed tasks this week”
“Tasks due tomorrow”


4. Delay Prediction

Predicts risk level:
Low / Medium / High
# Based on:
Workload
Due date
Progress
Historical performance

5. AI Assistant (Conversational)
Users can ask:
“Which tasks are overdue?”
“Who is least busy?”
“Summarize project progress”
“Create a task for login bug”


# 🔐 Security Features

Email verification
Forgot & reset password
JWT authentication
Optional 2FA (OTP)
Account lock on failed attempts
Helmet middleware
CORS protection
CSRF protection


# ⚡ Redis Usage (Upstash)
Redis is used for:
Caching dashboard data
Refresh token storage
Real-time pub/sub (Socket.IO)
Notification queues
Active session tracking

# 🧪 Testing Strategy
Unit Tests (Jest)
API Tests (Supertest)
Component Tests (React Testing Library)
End-to-End Tests (Cypress)


# 🚀 Deployment
1.Frontend => Vercel
2.Backend => Render 

# 🔄 CI/CD Pipeline
Implemented using GitHub Actions:
Linting
Running tests
Build validation
Auto deployment

# 🐳 Docker Support
Run locally using:
docker-compose up --build

# ⚙️ Environment Variables
#  Backend .env file 

1. NODE_ENV=development
2. PORT=7002
3. CLIENT_ORIGIN=http://localhost:5173
# comma-separated allowlist; falls back to CLIENT_ORIGIN if unset
4. CORS_ALLOWLIST=http://localhost:5173

# ----- Database -----
5. MONGO_URI=mongodb://Sathish_CH:Ch.sathish460@ac-o3qp2xm-shard-00-00.r0ntafm.mongodb.net:27017,ac-o3qp2xm-shard-00-01.r0ntafm.mongodb.net:27017,ac-o3qp2xm-shard-00-02.r0ntafm.mongodb.net:27017/test?ssl=true&replicaSet=atlas-2fdo7u-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0

# ----- Auth / JWT -----
6. JWT_ACCESS_SECRET=change-me-access
7. JWT_REFRESH_SECRET=change-me-refresh
# Tokens: access 15m, refresh 7d (hard-coded in utils/token.js for now)

# ----- Redis (Upstash) -----
8. REDIS_URL=rediss://default:gQAAAAAAAXe-AAIncDFlZThkYjk3NWU0N2E0OTA4ODFlNTM4MjVkYWFjNjZlZXAxOTYxOTA@apt-crane-96190.upstash.io:6379

# ----- Email (Nodemailer) -----
9. SMTP_HOST=smtp.gmail.com
10. SMTP_PORT=587
11. SMTP_USER=ch.sathish460@gmail.com
12. SMTP_PASS=vkwh mqos yngb epgm
13. SMTP_FROM="MERN Task Manager <ch.sathish460@gmail.com>"

# ----- Cloudinary (attachments) -----
14. CLOUDINARY_CLOUD_NAME=dvpd8pzkl
15. CLOUDINARY_API_KEY=692531915228354
16. CLOUDINARY_API_SECRET=H0MGvYtQQFICjriKvZ_qEZkyrdk

# ----- AI (DeepSeek) -----
17. DEEPSEEK_API_KEY=sk-3ef1438b4d4249eabdbb718a646f4dfc
18. AI_MODEL=deepseek-chat

# ----- Web Push (VAPID) -----
# Generate with: node -e "console.log(require('web-push').generateVAPIDKeys())"
19. VAPID_PUBLIC_KEY=BG14KoovhUrg4iAL30L6jVnlp-XtZGPlN93Ms5ySlBGmiKgX5_plzLvBKypA6qamueyhICn_9JUp3M1PHi6SX-Y
20. VAPID_PRIVATE_KEY=WHUS5pjEHrBYgx_trp6XfswWOH0JF5I4bskKxkagUBc
21. VAPID_CONTACT_EMAIL=ch.sathish460@gmail.com

# ----- Public app URL (for links inside emails) -----
22. APP_URL=http://localhost:5173

# Frontend .env file

<!-- VITE_API_URL=http://localhost:7002 -->
23. VITE_API_URL= https://enterprise-task-manager-mern.onrender.com/


# ADMIN CREDENTIAL 
# email: sathish91577@gmail.com
# password: Sathish91577@
# role : "admin"

# 📸 Screenshots
Kanban Board
Admin Dashboard
User Dashboard
Task Details View
(I made a document and attached in mail )

# 📦 Deliverables

# 1. GitHub Repository : https://github.com/SATHISH-108/Enterprise-task-manager-mern
3. Enterprise-task-manager-mern
# 2. Live Frontend URL : https://enterprise-task-manager-mern.vercel.app/login
# 3. Live Backend API : https://enterprise-task-manager-mern.onrender.com/





# Run The Project (Project setup) 

# Backend 
1. cd Backend 
2. npm install (It install all node module packages)
3. node src/server.js (It run the backend server) 


# Frontend
1. cd Frontend
2. npm install (It install all node module packages)
3. npm run dev  (It run the Frontend project) 

# #Note 
# 🔐 Two-Factor Authentication (2FA)

For enhanced security, this application supports Two-Factor Authentication (2FA) during login.

To use this feature, you need to install an authenticator app on your mobile device.

# 📱 Recommended App:
Google Authenticator (Available on Play Store)
⚙️ How it works:
1. During setup, a QR code or secret key will be provided.
2. Scan the QR code using the Google Authenticator app.
3. The app will generate a 6-digit code that changes every few seconds.
4. Enter this code during login to complete authentication.
# ⚠️ Important Note:
1. Make sure your device time is synchronized correctly for valid OTP generation.
2. Without the correct 6-digit code, login will not be allowed.

# Two Factor Authentication Process

The application has a Two-Factor Authentication (2FA) feature for better security.

1. When a user & admin tries to log in and 2FA(Two Factor Authentication) is turned off(From the MongoDB), they must first verify their email. A verification link is sent to their email, and after verifying, they can log in and go to the dashboard.

2. In the dashboard, the user can click on the profile icon and see options like Settings and Sign Out. In the Settings page, they can see whether 2FA is enabled or disabled.

3. If the user wants to enable 2FA, they can click the enable button. A QR code will be shown along with a field to enter a 6-digit code. The user needs to scan the QR code using an authenticator app (like Google Authenticator From Playstore). The app will generate a 6-digit code that changes every few seconds.

4. The user must enter this code in the input field. Once the code is verified, 2FA will be enabled and saved in the database (MongoDB).

5. If the user does not want 2FA, they can disable it anytime from the Settings page.

Note: In Email I attached a PDF File it contains all screenshots of Two Factor Authentication process.