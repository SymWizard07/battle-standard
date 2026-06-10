import { useEffect, useState } from 'react';
import { getTemplateTokenObjectUrl } from '../../lib/templateTokenImage';

interface Props {
  templateColor: string;
  size?: number;
  className?: string;
}

export function TemplateTokenThumb({ templateColor, size = 64, className = '' }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getTemplateTokenObjectUrl(templateColor).then((objectUrl) => {
      if (alive) setUrl(objectUrl);
    });
    return () => {
      alive = false;
    };
  }, [templateColor]);

  if (!url) {
    return (
      <div
        className={`bg-slate-800 ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  );
}
