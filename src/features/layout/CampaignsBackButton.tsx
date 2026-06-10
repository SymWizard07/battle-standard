import { Link } from 'react-router-dom';

type Props = {
  className?: string;
};

export function CampaignsBackButton({ className = '' }: Props) {
  return (
    <Link
      to="/"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-slate-400 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white ${className}`}
      aria-label="Back to campaigns"
      title="Campaigns"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </Link>
  );
}
