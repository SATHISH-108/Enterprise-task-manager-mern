import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * Render helper that wires the providers every screen depends on:
 *   - React Query (with retries off so failed mocks fail fast)
 *   - In-memory router (initialEntries lets a test pretend it's on a route)
 *
 * Auth is intentionally NOT wrapped here — most tests either don't need a user
 * or want to mock the store directly with vi.mock().
 */
export const renderWithProviders = (
  ui,
  { initialEntries = ["/"], queryClient } = {},
) => {
  const qc =
    queryClient ||
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};
