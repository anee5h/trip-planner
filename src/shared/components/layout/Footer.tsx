import { Link } from "react-router-dom";
import { useLocale } from "@/shared/context/LocaleContext";

export default function Footer() {
  const { locale } = useLocale();
  const copy =
    locale === "ja"
      ? {
          tagline: "日本の旅を計画・比較できるガイド",
          terms: "利用規約",
          privacy: "プライバシー",
          cookies: "Cookie",
          feedback: "フィードバック",
        }
      : {
          tagline: "Your Japan trip planner & decision engine.",
          terms: "Terms",
          privacy: "Privacy",
          cookies: "Cookies",
          feedback: "Feedback",
        };
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 py-12 bg-slate-50 dark:bg-slate-900 mt-16 sm:mt-24">
      <div className="container mx-auto px-4 flex flex-col items-center justify-center text-center gap-4">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center justify-center gap-2">
            TabiMap{" "}
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-500">
              v{__APP_VERSION__}
            </span>
          </p>
          <p className="text-sm text-slate-500 mt-1">{copy.tagline}</p>
        </div>

        <div className="flex gap-4 text-sm text-slate-500">
          <Link
            to="/terms"
            className="hover:text-emerald-500 transition-colors"
          >
            {copy.terms}
          </Link>
          <Link
            to="/privacy"
            className="hover:text-emerald-500 transition-colors"
          >
            {copy.privacy}
          </Link>
          <Link
            to="/cookies"
            className="hover:text-emerald-500 transition-colors"
          >
            {copy.cookies}
          </Link>
          <a
            href="mailto:kaihatsu.studio@gmail.com"
            className="hover:text-emerald-500 transition-colors"
          >
            {copy.feedback}
          </a>
        </div>
      </div>
    </footer>
  );
}
