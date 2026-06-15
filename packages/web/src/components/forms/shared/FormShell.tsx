import type { FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";

type FormShellProps = {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isBusy: boolean;
  isSubmitDisabled: boolean;
  submitLabel: string;
  busyLabel: string;
  error?: string | null;
  onReset?: () => void;
  resetDisabled?: boolean;
  children: ReactNode;
  customActions?: ReactNode;
  header?: string;
  hideHeader?: boolean;
};

/**
 * Shared form shell with loading overlay, submit/reset buttons, and error state.
 * Used by FormComponent (react-hook-form) and PathwayConnectionForm (manual state).
 */
function FormShell({
  onSubmit,
  isBusy,
  isSubmitDisabled,
  submitLabel,
  busyLabel,
  error,
  onReset,
  resetDisabled,
  children,
  customActions,
  header,
  hideHeader = false,
}: FormShellProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-2 relative">
      {isBusy && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/80 backdrop-blur-[1px]">
          <div className="rounded-md border bg-background px-4 py-2 text-sm font-medium shadow-sm">
            {busyLabel}
          </div>
        </div>
      )}
      {!hideHeader && header && <h2 className="text-2xl font-bold mb-2">{header}</h2>}
      {children}
      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          variant="outline"
          disabled={isSubmitDisabled || isBusy}
          className={`px-6 ${error ? "bg-destructive text-destructive-foreground" : ""}`}
        >
          {isBusy ? busyLabel : error ? "Retry" : submitLabel}
        </Button>
        {onReset && (
          <Button
            type="button"
            variant="secondary"
            onClick={onReset}
            disabled={resetDisabled ?? isBusy}
            className="px-6"
          >
            Reset
          </Button>
        )}
        {customActions}
      </div>
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
    </form>
  );
}

export default FormShell;
