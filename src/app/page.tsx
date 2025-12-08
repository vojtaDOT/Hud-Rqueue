import { TaskForm } from '@/components/task-form';
import { StressTest } from '@/components/stress-test';
import { AnimatedBackground } from '@/components/animated-background';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 relative">
      <AnimatedBackground />
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex mb-12">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          Redis Queue Manager
        </p>
      </div>

      <div className="w-full space-y-8">
        <TaskForm />
        <StressTest />
      </div>
    </main>
  );
}
