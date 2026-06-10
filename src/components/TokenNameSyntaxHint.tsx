export function TokenNameSyntaxHint({
  className = '',
  showTitle = false,
}: {
  className?: string;
  showTitle?: boolean;
}) {
  return (
    <div className={className}>
      {showTitle ? (
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
          Name styling
        </p>
      ) : null}
      <p className="text-[10px] leading-snug text-slate-500">
        {!showTitle ? 'Name styling: ' : null}
        <code className="text-slate-400">#RGB</code> color,{' '}
        <code className="text-slate-400">#</code> reset,{' '}
        <code className="text-slate-400">*bold*</code>,{' '}
        <code className="text-slate-400">_italic_</code>,{' '}
        <code className="text-slate-400">~underline~</code>,{' '}
        <code className="text-slate-400">-strike-</code>,{' '}
        <code className="text-slate-400">?obfuscate?</code>
      </p>
    </div>
  );
}
