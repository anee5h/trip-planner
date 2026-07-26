import type { ReactNode } from "react";

export function PageTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={`text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight ${className}`}
    >
      {children}
    </h1>
  );
}

export function SectionTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`text-lg font-bold text-slate-900 dark:text-white ${className}`}
    >
      {children}
    </h2>
  );
}

export function CardTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={`text-sm font-bold text-slate-900 dark:text-white ${className}`}
    >
      {children}
    </h3>
  );
}

export function BodyText({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-xs md:text-sm text-slate-600 dark:text-slate-300 leading-relaxed ${className}`}
    >
      {children}
    </p>
  );
}

export function Caption({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`text-[11px] text-slate-500 dark:text-slate-400 ${className}`}
    >
      {children}
    </span>
  );
}
