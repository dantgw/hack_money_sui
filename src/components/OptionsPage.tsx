import { Card } from "./ui/card";

export function OptionsPage() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center px-4">
      <Card className="max-w-xl w-full p-8 space-y-4">
        <h2 className="text-2xl font-semibold">Options Trading</h2>
        <p className="text-muted-foreground">
          The Options page is under construction. Soon you&apos;ll be able to
          trade options powered by Varuna here.
        </p>
      </Card>
    </div>
  );
}

