import { GameGate } from '@/components/GameGate';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <GameGate game="awale" roomPrefix="/awale/salon/">
      {children}
    </GameGate>
  );
}
