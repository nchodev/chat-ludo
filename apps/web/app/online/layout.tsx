import { GameGate } from '@/components/GameGate';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <GameGate game="ludo" roomPrefix="/online/">
      {children}
    </GameGate>
  );
}
