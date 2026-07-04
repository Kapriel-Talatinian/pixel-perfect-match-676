import { createFileRoute } from "@tanstack/react-router";
import { MaydayConsole } from "@/components/mayday/MaydayConsole";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <MaydayConsole />;
}
