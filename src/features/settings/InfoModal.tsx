import { useEffect, useRef } from 'react';
import { APP_TITLE } from '../../hooks/useDocumentTitle';
import { INFO_INTRO, INFO_SECTIONS } from './infoContent';

interface Props {
  open: boolean;
  onClose: () => void;
}

function scrollToInfoSection(id: string) {
  document.getElementById(`info-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function InfoModal({ open, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: 0 });
  }, [open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[80] bg-black/60"
        aria-label="Close info"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-title"
        className="fixed left-1/2 top-1/2 z-[90] flex max-h-[min(36rem,calc(100vh-2rem))] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-600 bg-slate-900 shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-700 px-4 py-3">
          <h2 id="info-title" className="text-base font-semibold text-slate-100">
            How to use {APP_TITLE}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close info"
          >
            ✕
          </button>
        </header>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          <p className="text-sm leading-relaxed text-slate-300">{INFO_INTRO}</p>

          <nav
            aria-label="Contents"
            className="mt-4 rounded-xl border border-slate-700/80 bg-slate-950/50 p-3"
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Contents
            </p>
            <ul className="space-y-0.5">
              {INFO_SECTIONS.map((section) => {
                const Icon = section.icon;
                return (
                  <li key={section.id}>
                    <a
                      href={`#info-${section.id}`}
                      className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-slate-300 hover:bg-slate-800/60 hover:text-sky-300"
                      onClick={(e) => {
                        e.preventDefault();
                        scrollToInfoSection(section.id);
                      }}
                    >
                      <Icon className="text-sky-400/80" />
                      {section.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {INFO_SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.id}>
                <hr className="my-5 border-slate-700" />
                <section id={`info-${section.id}`} className="scroll-mt-3">
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                    <Icon className="text-sky-400" />
                    {section.title}
                  </h3>
                  <ul className="space-y-1.5 text-sm leading-relaxed text-slate-400">
                    {section.body.map((line) => (
                      <li key={line} className="pl-0.5">
                        {line}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
