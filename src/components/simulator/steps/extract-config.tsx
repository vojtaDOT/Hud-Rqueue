import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LegacyBlockChange, LegacyBlockData } from "./legacy-types";

interface ExtractConfigProps {
    block: LegacyBlockData;
    onChange: LegacyBlockChange;
}

export function ExtractConfig({ block, onChange }: ExtractConfigProps) {
    return (
        <div className="space-y-4 pt-4">
            <div className="space-y-2">
                <Label htmlFor="attribute">Attribute to Extract</Label>
                <Input
                    id="attribute"
                    placeholder="e.g. href, src, or text"
                    value={block.config?.attribute || 'text'}
                    onChange={(e) => onChange(block.id, { ...block.config, attribute: e.target.value })}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="field">Field Name</Label>
                <Input
                    id="field"
                    placeholder="e.g. title"
                    value={block.config?.fieldName || ''}
                    onChange={(e) => onChange(block.id, { ...block.config, fieldName: e.target.value })}
                />
            </div>
        </div>
    );
}
