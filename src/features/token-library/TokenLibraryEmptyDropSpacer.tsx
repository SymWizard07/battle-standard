/** Invisible thumb-sized slot so empty groups keep drop target height during drags. */
export function TokenLibraryEmptyDropSpacer() {
  return (
    <div className="invisible pointer-events-none" aria-hidden>
      <div className="aspect-square rounded-lg border border-transparent" />
      <span className="mt-1 block truncate text-center text-[10px] leading-tight">&nbsp;</span>
    </div>
  );
}
