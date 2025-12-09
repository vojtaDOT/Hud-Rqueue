import { TaskForm } from '@/components/task-form';
import { StressTest } from '@/components/stress-test';
import { AnimatedBackground } from '@/components/animated-background';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 relative pt-20">
      <AnimatedBackground />

      <div className="w-full space-y-8">
        <TaskForm />
        <StressTest />
      </div>
    </main>
  );
}
