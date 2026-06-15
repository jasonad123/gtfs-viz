import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BiPencil, BiPlus } from "react-icons/bi";

interface EditIndicatorProps {
  status?: string;
  className?: string;
}

const getStatusKind = (status?: string | null): "edit" | "new" | null => {
  if (status === "new" || status === "new edit") return "new";
  if (status === "edit") return "edit";
  return null;
};

export function EditIndicator({
  status,
  className = "h-6 w-6",
}: EditIndicatorProps) {
  const statusKind = getStatusKind(status);

  if (!statusKind || !status) return null;

  return (
    <span className="inline-block relative group shrink-0">
      <Avatar className={className}>
        <AvatarFallback
          className={
            statusKind === "new"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground"
          }
        >
          {statusKind === "new" ? (
            <BiPlus className="h-4 w-4" />
          ) : (
            <BiPencil className="h-4 w-4" />
          )}
        </AvatarFallback>
      </Avatar>
      <span className="invisible group-hover:visible absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded whitespace-nowrap z-50 border shadow-md">
        {statusKind === "new" ? "New" : "Edited"}
      </span>
    </span>
  );
}
