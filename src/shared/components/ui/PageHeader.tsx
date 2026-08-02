import type React from "react";
import { Link } from "react-router-dom";
import { designTokens } from "@/shared/theme/design-tokens";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  statusBadge?: React.ReactNode;
  description?: string;
  descriptionClassName?: string;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  compact?: boolean;
  stackActionsOnMobile?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  statusBadge,
  description,
  descriptionClassName,
  actions,
  tabs,
  breadcrumbs,
  compact = false,
  stackActionsOnMobile = false,
}: PageHeaderProps) {
  return (
    <header className={`space-y-base ${compact ? "pb-base" : "pb-xl"}`}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          {breadcrumbs.map((item, idx) => (
            <span key={idx} className="flex items-center gap-2">
              {idx > 0 && <span>/</span>}
              {item.href ? (
                <Link
                  to={item.href}
                  className="hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-foreground font-medium">
                  {item.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div
        className={`flex items-start justify-between gap-base ${stackActionsOnMobile ? "max-[399px]:flex-col" : ""}`}
      >
        <div className="space-y-xs">
          {subtitle && (
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {subtitle}
            </div>
          )}
          <div className="flex items-center gap-sm">
            <h1 className={designTokens.typography.pageTitle}>{title}</h1>
            {statusBadge}
          </div>
          {description && (
            <p
              className={`${designTokens.typography.secondary} ${descriptionClassName ?? ""}`}
            >
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-sm shrink-0">{actions}</div>
        )}
      </div>

      {tabs && <div className="mt-base">{tabs}</div>}
    </header>
  );
}
