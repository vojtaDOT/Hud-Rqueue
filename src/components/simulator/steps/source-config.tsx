import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BlockData } from "../types";

interface SourceConfigProps {
    block: BlockData;
    onChange: (id: string, newConfig: any) => void;
}

export function SourceConfig({ block, onChange }: SourceConfigProps) {
    return (
        <div className="space-y-4 pt-4">
            <div className="space-y-2">
                <Label htmlFor="url">Source URL</Label>
                <Input
                    id="url"
                    placeholder="e.g. https://example.com"
                    value={block.config?.url || ''}
                    onChange={(e) => onChange(block.id, { ...block.config, url: e.target.value })}
                />
            </div>
        </div>
    );
}
