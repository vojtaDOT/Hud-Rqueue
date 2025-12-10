import { Dashboard } from '@/components/dashboard';
import { AnimatedBackground } from '@/components/animated-background';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-8 relative pt-20">
      <AnimatedBackground />

      <div className="w-full z-10">
        <Dashboard />
      </div>
    </main>
  );
}
