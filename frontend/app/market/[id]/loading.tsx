import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-6 space-y-8">
      <header>
        <Skeleton className="h-8 w-1/3 mb-2" />
        <Skeleton className="h-4 w-2/3 mb-2" />
        <Skeleton className="h-4 w-1/4" />
      </header>
      <section className="bg-card p-4 rounded-lg border">
        <Skeleton className="h-6 w-1/4 mb-4" />
        <Skeleton className="h-[300px] w-full" />
      </section>
      <section>
        <Skeleton className="h-6 w-1/4 mb-4" />
        <Skeleton className="h-10 w-full mb-2" />
        <Skeleton className="h-10 w-full mb-2" />
        <Skeleton className="h-10 w-full mb-2" />
      </section>
    </div>
  );
}
