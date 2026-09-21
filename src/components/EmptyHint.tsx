import type { ReactNode } from 'react';

type Props = {
  title: string;
  body: string;
  action?: ReactNode;
};

/** Fat-thumb empty state — short, friendly, not scary. */
export function EmptyHint({ title, body, action }: Props) {
  return (
    <div className="empty-hint">
      <p className="empty-hint__title">{title}</p>
      <p className="empty-hint__body">{body}</p>
      {action ? <div className="empty-hint__action">{action}</div> : null}
    </div>
  );
}
