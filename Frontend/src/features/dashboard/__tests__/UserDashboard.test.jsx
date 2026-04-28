import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render.jsx";

// Stub the network + auth dependencies so the dashboard renders deterministically.
vi.mock("../../../shared/api/endpoints.js", () => ({
  analyticsApi: {
    me: vi.fn().mockResolvedValue({
      data: {
        totals: {
          assigned: 5,
          completed: 3,
          overdue: 1,
          upcomingWeek: 2,
          estimatedWorkloadHours: 8,
        },
        completedPerDay: [],
        weekTasks: [],
        hoursByDay: [],
      },
    }),
  },
  teamsApi: { list: vi.fn().mockResolvedValue({ data: { teams: [] } }) },
  notifsApi: {},
  tasksApi: {},
  usersApi: {},
  projectsApi: { list: vi.fn().mockResolvedValue({ data: { projects: [] } }) },
  aiApi: {},
}));

vi.mock("../../../store/authStore.js", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "Tester", role: "user" },
    status: "authed",
  }),
}));

// NextTaskCard subscribes to socket events; stub it out so the component tree
// doesn't try to open a real WebSocket in jsdom.
vi.mock("../../recommendations/NextTaskCard.jsx", () => ({
  default: () => <div data-testid="next-task-card-stub" />,
}));

describe("UserDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the welcome header and the totals row after data loads", async () => {
    const UserDashboard = (await import("../UserDashboard.jsx")).default;
    renderWithProviders(<UserDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Assigned/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Welcome back/i)).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument(); // assigned count
    expect(screen.getByText(/Overdue/i)).toBeInTheDocument();
  });
});
