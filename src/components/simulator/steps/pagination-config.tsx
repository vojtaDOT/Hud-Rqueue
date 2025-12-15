import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BlockData } from "../types";

interface PaginationConfigProps {
    block: BlockData;
    onChange: (id: string, newConfig: any) => void;
}

export function PaginationConfig({ block, onChange }: PaginationConfigProps) {
    return (
        <div className="space-y-4 pt-4">
            <div className="space-y-2">
                <Label htmlFor="next-btn">Next Button Selector</Label>
                <Input
                    id="next-btn"
                    placeholder="e.g. .next-page"
                    value={block.config?.selector || ''}
                    onChange={(e) => onChange(block.id, { ...block.config, selector: e.target.value })}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="max-pages">Max Pages</Label>
                <Input
                    id="max-pages"
                    type="number"
                    placeholder="10"
                    value={block.config?.maxPages || ''}
                    onChange={(e) => onChange(block.id, { ...block.config, maxPages: e.target.value })}
                />
            </div>
        </div>
    );
}
