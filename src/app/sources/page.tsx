import { Suspense } from 'react';
import { SourceEditorContainer } from '@/components/sources/source-editor-container';

export default function SourcesPage() {
    return (
        <main className="h-dvh w-full overflow-hidden flex flex-col">
            <Suspense>
                <SourceEditorContainer />
            </Suspense>
        </main>
    );
}
