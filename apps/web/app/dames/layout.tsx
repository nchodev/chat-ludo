import { GameGate } from '@/components/GameGate';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <GameGate game="dames" roomPrefix="/dames/salon/">
      {children}
    </GameGate>
  );
}
