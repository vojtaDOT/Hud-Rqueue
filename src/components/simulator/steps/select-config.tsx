import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BlockData } from "../types";

interface SelectConfigProps {
    block: BlockData;
    onChange: (id: string, newConfig: any) => void;
}

export function SelectConfig({ block, onChange }: SelectConfigProps) {
    return (
        <div className="space-y-4 pt-4">
            <div className="space-y-2">
                <Label htmlFor="selector">CSS Selector</Label>
                <Input
                    id="selector"
                    placeholder="e.g. .product-item"
                    value={block.config?.selector || ''}
                    onChange={(e) => onChange(block.id, { ...block.config, selector: e.target.value })}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="variable">Variable Name</Label>
                <Input
                    id="variable"
                    placeholder="e.g. products"
                    value={block.config?.variable || ''}
                    onChange={(e) => onChange(block.id, { ...block.config, variable: e.target.value })}
                />
            </div>
        </div>
    );
}
