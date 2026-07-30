import { NameGate } from "../components/NameGate";
import { OfflineBanner } from "../components/OfflineBanner";
import { getShanghaiBusinessDate } from "../domain/date";
import type { ActiveIdentity } from "../domain/identity";
import { useIdentity } from "../hooks/useIdentity";
import { useOrderSync } from "../hooks/useOrderSync";
import { MenuPage } from "../menu/MenuPage";

function formatBusinessDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function OrderingApp({ identity, onEditName }: { identity: ActiveIdentity; onEditName: () => void }) {
  const { restaurantName, menu, order, status, adjust, setShareCount } = useOrderSync(identity);

  return (
    <>
      <OfflineBanner visible={status === "offline"} />
      <MenuPage
        restaurantName={restaurantName}
        date={formatBusinessDate(getShanghaiBusinessDate())}
        displayName={identity.displayName}
        deviceId={identity.deviceId}
        status={status}
        menu={menu}
        order={order}
        onAdjust={adjust}
        onShareCount={setShareCount}
        onOverview={() => {
          window.history.pushState({}, "", "/overview");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
        onEditName={onEditName}
      />
    </>
  );
}

export function App() {
  const { identity, saveName, editName } = useIdentity();
  if (!identity.displayName) return <NameGate onSubmit={saveName} />;
  return <OrderingApp identity={{ deviceId: identity.deviceId, displayName: identity.displayName }} onEditName={editName} />;
}
