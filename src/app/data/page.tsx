import { DataSeeder } from '@/components/data-seeder';

export default function DataPage() {
    return (
        <main className="px-4 py-5 sm:px-6">
            <div className="mx-auto max-w-4xl">
                <DataSeeder />
            </div>
        </main>
    );
}
