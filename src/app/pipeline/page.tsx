import { AnimatedBackground } from '@/components/animated-background';
import { ManualPipeline } from '@/components/pipeline/manual-pipeline';

export default function PipelinePage() {
    return (
        <main className="flex min-h-screen flex-col items-center p-8 relative pt-20">
            <AnimatedBackground />
            <div className="w-full z-10">
                <ManualPipeline />
            </div>
        </main>
    );
}
