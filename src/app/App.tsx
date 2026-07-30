import { NameGate } from "../components/NameGate";
import { useIdentity } from "../hooks/useIdentity";

export function App() {
  const { identity, saveName } = useIdentity();
  if (!identity.displayName) return <NameGate onSubmit={saveName} />;
  return <h1>今日点餐</h1>;
}
