type IconProps = { className?: string };

const base = 'h-3 w-3 shrink-0';

function mergeIconClass(className?: string) {
  return className ? `${base} ${className}` : base;
}

export function ScenesInfoIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={mergeIconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 9h10M7 13h6" />
    </svg>
  );
}

export function HostingInfoIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={mergeIconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function ToolsInfoIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={mergeIconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h8M6 16h12" />
    </svg>
  );
}

export function SceneEditInfoIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={mergeIconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3z" />
      <path d="M16 16l5 5M19 13v6h6" />
    </svg>
  );
}

export function TokensInfoIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={mergeIconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M6 20v-1a6 6 0 0 1 12 0v1" />
    </svg>
  );
}

export function FogInfoIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={mergeIconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.54a4.5 4.5 0 1 1 0 9z" />
    </svg>
  );
}

export function MeasureInfoIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={mergeIconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 17l14-14 4 4L7 21H3v-4z" />
      <path d="M14 4l6 6" />
      <path d="M6 18h.01" />
    </svg>
  );
}

export function DrawInfoIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={mergeIconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

export function PlayerViewInfoIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={mergeIconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
