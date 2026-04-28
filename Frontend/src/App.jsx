import Providers from "./app/providers.jsx";
import AppRouter from "./app/router.jsx";

export default function App() {
  return (
    <Providers>
      <AppRouter />
    </Providers>
  );
}
