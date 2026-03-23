import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

export function AdvisorPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>💬 Advisor</SheetTitle>
        </SheetHeader>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Chat coming soon
        </div>
      </SheetContent>
    </Sheet>
  )
}
