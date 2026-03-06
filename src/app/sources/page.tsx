import { Suspense } from 'react';
import { SourceEditorContainer } from '@/components/sources/source-editor-container';

export default function SourcesPage() {
    return (
        <main className="min-h-dvh w-full flex flex-col">
            <Suspense>
                <SourceEditorContainer />
            </Suspense>
        </main>
    );
}
