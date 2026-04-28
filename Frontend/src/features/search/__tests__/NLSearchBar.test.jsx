import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render.jsx";

const nlSearch = vi.fn().mockResolvedValue({
  data: {
    tasks: [
      {
        _id: "t1",
        title: "Fix login bug",
        priority: "high",
        status: "todo",
        project: { name: "Web app", _id: "p1" },
      },
    ],
    source: "rules",
  },
});

vi.mock("../../../shared/api/endpoints.js", () => ({
  aiApi: { nlSearch },
}));

describe("NLSearchBar", () => {
  it("submits the typed query and renders the result list", async () => {
    const user = userEvent.setup();
    const NLSearchBar = (await import("../NLSearchBar.jsx")).default;
    renderWithProviders(<NLSearchBar />);

    const input = screen.getByPlaceholderText(/Try:/i);
    await user.type(input, "overdue high priority{Enter}");

    await waitFor(() => {
      expect(nlSearch).toHaveBeenCalledWith("overdue high priority");
    });

    await waitFor(() => {
      expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    });
  });
});
