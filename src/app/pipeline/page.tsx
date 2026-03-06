import { ManualPipeline } from '@/components/pipeline/manual-pipeline';

function parseDevFlag(value: string | undefined): boolean {
    if (!value) return false;
    return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export default function PipelinePage() {
    const devMode = parseDevFlag(process.env.DEV);
    return (
        <main className="px-4 py-5 sm:px-6">
            <ManualPipeline devMode={devMode} />
        </main>
    );
}
