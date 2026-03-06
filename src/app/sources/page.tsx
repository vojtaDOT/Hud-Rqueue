import { Suspense } from 'react';
import { SourceEditorContainer } from '@/components/sources/source-editor-container';

export default function SourcesPage() {
    return (
        <main className="flex min-h-dvh w-full flex-col md:h-dvh">
            <Suspense>
                <SourceEditorContainer />
            </Suspense>
        </main>
    );
}
