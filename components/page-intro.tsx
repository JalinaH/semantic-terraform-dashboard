export function PageIntro({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow ? <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p> : null}
        <h2 className={eyebrow ? "mt-2 text-2xl font-semibold tracking-[-0.025em]" : "text-2xl font-semibold tracking-[-0.025em]"}>{title}</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
