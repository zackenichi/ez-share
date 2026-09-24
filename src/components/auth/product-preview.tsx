import { Check, Sparkles } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

export function ProductPreview() {
  return (
    <div className="relative mx-auto mt-12 hidden h-72 w-full max-w-xl lg:block" aria-hidden="true">
      <Card className="absolute left-[8%] top-10 w-[68%] -rotate-2 gap-0 border border-white/70 bg-white/75 py-0 shadow-[0_30px_70px_-35px_rgba(44,37,85,0.45)] ring-0 backdrop-blur-xl">
        <CardContent className="p-4">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex gap-1.5">
              <span className="size-2 rounded-full bg-rose-300" />
              <span className="size-2 rounded-full bg-amber-300" />
              <span className="size-2 rounded-full bg-emerald-300" />
            </div>
            <div className="h-2 w-24 rounded-full bg-slate-100" />
          </div>
          <div className="grid grid-cols-[72px_1fr] gap-4">
            <div className="space-y-3 rounded-xl bg-slate-950 p-3">
              <div className="size-7 rounded-lg bg-violet-400" />
              <div className="h-1.5 w-9 rounded-full bg-white/50" />
              <div className="h-1.5 w-7 rounded-full bg-white/25" />
              <div className="h-1.5 w-10 rounded-full bg-white/25" />
            </div>
            <div className="space-y-3 py-1">
              <div className="h-3 w-28 rounded-full bg-slate-800" />
              <div className="grid grid-cols-3 gap-2">
                <div className="h-16 rounded-lg bg-violet-100" />
                <div className="h-16 rounded-lg bg-orange-100" />
                <div className="h-16 rounded-lg bg-sky-100" />
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100" />
              <div className="h-2 w-4/5 rounded-full bg-slate-100" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="absolute bottom-1 right-[5%] w-52 rotate-3 gap-0 border border-white/80 bg-white/90 py-0 shadow-[0_24px_60px_-30px_rgba(44,37,85,0.55)] ring-0 backdrop-blur-xl">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <Check className="size-4" strokeWidth={3} />
            </div>
            <div>
              <div className="h-2 w-20 rounded-full bg-slate-700" />
              <div className="mt-1.5 h-1.5 w-14 rounded-full bg-slate-200" />
            </div>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100" />
        </CardContent>
      </Card>

      <div className="absolute right-[3%] top-0 grid size-12 rotate-6 place-items-center rounded-2xl bg-amber-300 text-amber-950 shadow-lg">
        <Sparkles className="size-5" />
      </div>
    </div>
  );
}
