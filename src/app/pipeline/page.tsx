import { AnimatedBackground } from '@/components/animated-background';
import { ManualPipeline } from '@/components/pipeline/manual-pipeline';

function parseDevFlag(value: string | undefined): boolean {
    if (!value) return false;
    return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export default function PipelinePage() {
    const devMode = parseDevFlag(process.env.DEV);
    return (
        <main className="flex min-h-screen flex-col items-center p-8 relative pt-20">
            <AnimatedBackground />
            <div className="w-full z-10">
                <ManualPipeline devMode={devMode} />
            </div>
        </main>
    );
}
