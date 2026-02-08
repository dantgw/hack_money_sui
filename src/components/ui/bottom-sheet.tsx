import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

interface BottomSheetProps {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: string;
}

export function BottomSheet({ open, onClose, children, title }: BottomSheetProps) {
    useEffect(() => {
        if (open) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, onClose]);

    return (
        <>
            {/* Backdrop */}
            <div
                role="button"
                tabIndex={-1}
                aria-label="Close"
                onClick={onClose}
                onKeyDown={(e) => e.key === "Escape" && onClose()}
                className={cn(
                    "fixed inset-0 z-[60] bg-black/50 transition-opacity duration-300 lg:hidden",
                    open ? "opacity-100" : "pointer-events-none opacity-0"
                )}
            />

            {/* Sheet */}
            <div
                className={cn(
                    "fixed inset-x-0 bottom-0 z-[60] flex flex-col rounded-t-2xl bg-background shadow-2xl transition-transform duration-300 ease-out lg:hidden",
                    "max-h-[85vh]",
                    open ? "translate-y-0" : "translate-y-full"
                )}
            >
                {/* Drag handle */}
                <div className="flex shrink-0 items-center justify-center pt-3 pb-2">
                    <div className="h-1 w-12 rounded-full bg-muted-foreground/30" />
                </div>

                {/* Header with close button */}
                <div className="flex shrink-0 items-center justify-between border-b px-4 pb-3">
                    {title && (
                        <h3 className="font-semibold text-lg">{title}</h3>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="ml-auto rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors touch-manipulation"
                        aria-label="Close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
                    {children}
                </div>
            </div>
        </>
    );
}
