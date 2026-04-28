import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render.jsx";

vi.mock("../../../shared/api/endpoints.js", () => ({
  notifsApi: {
    unreadCount: vi.fn().mockResolvedValue({ data: { count: 3 } }),
    list: vi.fn().mockResolvedValue({ data: { items: [] } }),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

vi.mock("../../../shared/socket/useSocket.js", () => ({
  useSocketEvent: () => undefined,
}));

vi.mock("../usePushNotifications.js", () => ({
  default: () => ({
    supported: false,
    subscribed: false,
    busy: false,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

describe("NotificationBell", () => {
  it("renders the unread badge from the API response", async () => {
    const NotificationBell = (await import("../NotificationBell.jsx")).default;
    renderWithProviders(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });
});
