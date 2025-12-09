
import { SourceForm } from '@/components/source-form';
import { AnimatedBackground } from '@/components/animated-background';

export default function SourcesPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-8 relative pt-20">
            <AnimatedBackground />

            <div className="w-full space-y-8 z-10">
                <SourceForm />
            </div>
        </main>
    );
}
