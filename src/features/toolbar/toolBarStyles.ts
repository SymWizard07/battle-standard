/** Shared 44px height for top-bar tool controls. */
export const TOOLBAR_CONTROL_H = 'h-11';

export const toolBarControl = `${TOOLBAR_CONTROL_H} shrink-0`;

export const toolBarBtn =
  `${toolBarControl} rounded-lg px-3 text-xs bg-slate-800 text-slate-200 hover:bg-slate-700`;

export const toolBarBtnActive = `${toolBarControl} rounded-lg px-3 text-xs bg-sky-600 text-white`;

export const toolBarBtnIcon = `flex ${toolBarControl} items-center gap-2 rounded-lg px-3 text-xs`;

export const toolBarSection =
  'flex shrink-0 flex-nowrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-2';

export const toolBarSectionLabel =
  'shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500';

export const toolBarRow = 'flex shrink-0 flex-nowrap items-center gap-2';

export const toolBarScroll =
  `tool-options-scroll flex ${TOOLBAR_CONTROL_H} min-w-0 flex-nowrap items-center gap-2 overflow-x-auto`;
