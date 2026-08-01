import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface SectionViewAllLinkProps {
  to: string;
  ariaLabel: string;
}

export function SectionViewAllLink({ to, ariaLabel }: SectionViewAllLinkProps) {
  const { t } = useTranslation();

  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className="shrink-0 pt-1 text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors inline-flex items-center gap-1 group"
    >
      <span>{t("home.viewAll")}</span>
      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}
