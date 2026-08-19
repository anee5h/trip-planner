import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MegurutoMark } from "@/shared/components/brand/MegurutoMark";
import { formatAppVersion } from "@/shared/utils/version";

export default function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 py-4 md:py-12 bg-slate-50 dark:bg-slate-900 mt-6 md:mt-24">
      <div className="container mx-auto px-4 flex flex-col items-center justify-center text-center gap-2 md:gap-4">
        <div className="hidden md:block">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center justify-center gap-2">
            <MegurutoMark className="size-6" />
            <span>{t("brand.displayName")}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {formatAppVersion(__APP_VERSION__)}
            </span>
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t(
              "footer.tagline",
              "Discover and plan better trips across Japan.",
            )}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 sm:gap-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          <Link
            to="/terms"
            className="hover:text-emerald-500 transition-colors"
          >
            {t("legal.terms")}
          </Link>
          <span>•</span>
          <Link
            to="/privacy"
            className="hover:text-emerald-500 transition-colors"
          >
            {t("legal.privacy")}
          </Link>
          <span>•</span>
          <Link
            to="/cookies"
            className="hover:text-emerald-500 transition-colors"
          >
            {t("legal.cookies")}
          </Link>
          <span>•</span>
          <a
            href="mailto:info@meguruto.app"
            className="hover:text-emerald-500 transition-colors"
          >
            {t("legal.feedback")}
          </a>
        </div>
      </div>
    </footer>
  );
}
