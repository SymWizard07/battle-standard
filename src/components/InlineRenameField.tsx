import { useEffect, useRef, useState } from 'react';
import { StyledTokenName } from './StyledTokenName';
import { plainTokenName } from '../lib/tokenNameMarkup';

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

interface Props {
  value: string;
  onRename: (name: string) => void;
  canRename?: boolean;
  styledDisplay?: boolean;
  onRenamingChange?: (renaming: boolean) => void;
  className?: string;
  nameClassName?: string;
  inputClassName?: string;
}

export function InlineRenameField({
  value,
  onRename,
  canRename = true,
  styledDisplay = true,
  onRenamingChange,
  className = '',
  nameClassName = 'text-sm font-semibold',
  inputClassName = 'min-h-8 rounded border border-slate-600 bg-slate-800 px-2 text-sm',
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!renaming) setEditValue(value);
  }, [value, renaming]);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  useEffect(() => {
    onRenamingChange?.(renaming);
  }, [renaming, onRenamingChange]);

  useEffect(() => () => onRenamingChange?.(false), [onRenamingChange]);

  const startRename = () => {
    if (!canRename) return;
    setEditValue(value);
    setRenaming(true);
  };

  const commit = () => {
    const next = editValue.trim() || value;
    if (next !== value) onRename(next);
    setRenaming(false);
  };

  const cancel = () => {
    setEditValue(value);
    setRenaming(false);
  };

  if (renaming) {
    return (
      <form
        className={`min-w-0 flex-1 ${className}`}
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <input
          ref={inputRef}
          className={`w-full min-w-0 ${inputClassName}`}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          autoFocus
          aria-label="Rename"
        />
      </form>
    );
  }

  return (
    <div className={`flex min-w-0 items-center gap-1 ${className}`}>
      {styledDisplay ? (
        <StyledTokenName
          value={value}
          className={`min-w-0 flex-1 truncate ${nameClassName} ${canRename ? 'cursor-text' : ''}`}
          title={plainTokenName(value)}
          onDoubleClick={canRename ? startRename : undefined}
        />
      ) : (
        <span
          className={`min-w-0 flex-1 truncate ${nameClassName} ${canRename ? 'cursor-text' : ''}`}
          title={value}
          onDoubleClick={startRename}
        >
          {value}
        </span>
      )}
      {canRename && (
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          onClick={startRename}
          aria-label="Rename"
          title="Rename"
        >
          <PencilIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
