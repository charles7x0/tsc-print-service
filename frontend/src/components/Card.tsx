import type { ReactNode } from 'react';

interface CardProps {
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}

export function Card({ title, description, className, children }: CardProps) {
  const headingId = `card-${title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <section
      className={`card${className ? ' ' + className : ''}`}
      aria-labelledby={headingId}
    >
      <h2 id={headingId}>{title}</h2>
      {description ? <p className="muted">{description}</p> : null}
      {children}
    </section>
  );
}
