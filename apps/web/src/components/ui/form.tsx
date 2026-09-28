import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import s from './ui.module.css';

/** Grouped form: label on the left, input on the right (as on the Join screen). */
export function FormList({ children }: { children: ReactNode }) {
  return <section className={s.card}>{children}</section>;
}

export function FormRow({
  label,
  htmlFor,
  invalid,
  suffix,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  invalid?: boolean;
  suffix?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cx(s.formRow, invalid && s.invalid)}>
      <label className={s.formLabel} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {suffix && <span className={s.suffix}>{suffix}</span>}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(s.formInput, className)} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(s.formInput, className)} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(s.textarea, className)} {...rest} />;
}

export function FieldErrors({ errors }: { errors: (string | undefined)[] }) {
  const messages = errors.filter(Boolean);
  if (messages.length === 0) return null;
  return (
    <div role="alert">
      {messages.map((message) => (
        <p key={message} className={s.fieldError}>
          {message}
        </p>
      ))}
    </div>
  );
}
