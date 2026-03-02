import { DataSeeder } from '@/components/data-seeder';

export default function DataPage() {
    return (
        <main className="p-6 pt-5">
            <div className="max-w-4xl mx-auto">
                <DataSeeder />
            </div>
        </main>
    );
}
