import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { WorklistPage } from "./pages/WorklistPage";
import { RecommendationDetailPage } from "./pages/RecommendationDetailPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const router = createBrowserRouter([
  { path: "/", element: <WorklistPage /> },
  { path: "/recommendations/:id", element: <RecommendationDetailPage /> },
]);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
