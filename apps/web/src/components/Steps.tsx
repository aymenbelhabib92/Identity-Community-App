import { Check, Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Card } from './ui';
import s from './Steps.module.css';

export type StepState = 'todo' | 'current' | 'waiting' | 'done';

export interface StepItem {
  title: ReactNode;
  text?: ReactNode;
  state?: StepState;
  action?: ReactNode;
}

/** Numbered membership steps (join → pay → verified). */
export function Steps({ steps, className }: { steps: StepItem[]; className?: string }) {
  return (
    <Card className={className}>
      {steps.map((step, index) => (
        <div key={index} className={s.step}>
          <span className={cx(s.number, s[step.state ?? 'todo'])} aria-hidden>
            {step.state === 'done' ? <Check strokeWidth={3} /> : step.state === 'waiting' ? <Clock strokeWidth={2.6} /> : index + 1}
          </span>
          <div className={s.body}>
            <p className={s.title}>{step.title}</p>
            {step.text && <p className={s.text}>{step.text}</p>}
            {step.action && <div className={s.action}>{step.action}</div>}
          </div>
        </div>
      ))}
    </Card>
  );
}
