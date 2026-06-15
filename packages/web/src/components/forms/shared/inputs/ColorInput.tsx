import { Input } from "@/components/ui/input";
import { normalizeHex } from "../colors";

type ColorInputProps = {
  value: unknown;
  onChange: (value: string) => void;
  ref?: any;
  disabled?: boolean;
  fallback?: string;
};

/**
 * Color picker + hex text input combo.
 * Used for route_color and route_text_color fields.
 */
function ColorInput({ value, onChange, ref, disabled, fallback = "#4f46e5" }: ColorInputProps) {
  const displayValue = normalizeHex(value, fallback);
  return (
    <div className="flex items-center gap-2">
      <Input
        ref={ref}
        type="color"
        value={displayValue}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-10 w-14 p-1"
      />
      <Input
        type="text"
        value={displayValue}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

export default ColorInput;
