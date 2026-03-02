import { NextResponse } from 'next/server';
import {
    computeDocumentHealth,
    fetchAllDocuments,
    fetchAllSources,
    fetchAllSourceUrls,
    getSourceDuplicateGroups,
    getSourceUrlDuplicateGroups,
} from '@/lib/storage-data';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [documents, sources, sourceUrls] = await Promise.all([
            fetchAllDocuments(false),
            fetchAllSources(),
            fetchAllSourceUrls(),
        ]);

        const health = computeDocumentHealth(documents);
        const sourceDuplicates = getSourceDuplicateGroups(sources);
        const sourceUrlDuplicates = getSourceUrlDuplicateGroups(sourceUrls);

        return NextResponse.json({
            success: true,
            health,
            duplicateSummary: {
                sourceGroups: sourceDuplicates.length,
                sourceUrlGroups: sourceUrlDuplicates.length,
                documentUrlGroups: health.duplicateDocumentUrlGroups,
                documentChecksumGroups: health.duplicateDocumentChecksumGroups,
            },
        });
    } catch (error) {
        console.error('storage overview failed', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to build storage overview' },
            { status: 500 },
        );
    }
}
