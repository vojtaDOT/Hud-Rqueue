import { ManualPipeline } from '@/components/pipeline/manual-pipeline';

function parseDevFlag(value: string | undefined): boolean {
    if (!value) return false;
    return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export default function PipelinePage() {
    const devMode = parseDevFlag(process.env.DEV);
    return (
        <main className="p-6 pt-5">
            <ManualPipeline devMode={devMode} />
        </main>
    );
}
