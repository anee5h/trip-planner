import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t py-8 bg-slate-50 dark:bg-slate-900 mt-auto">
      <div className="container mx-auto px-4 flex flex-col items-center justify-center text-center gap-4">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center justify-center gap-2">
            TabiMap{" "}
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-500">
              v{__APP_VERSION__}
            </span>
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Your Japan trip planner & decision engine.
          </p>
        </div>

        <div className="flex gap-4 text-sm text-slate-500">
          <Link
            to="/terms"
            className="hover:text-emerald-500 transition-colors"
          >
            Terms
          </Link>
          <Link
            to="/privacy"
            className="hover:text-emerald-500 transition-colors"
          >
            Privacy
          </Link>
          <Link
            to="/cookies"
            className="hover:text-emerald-500 transition-colors"
          >
            Cookies
          </Link>
          <a
            href="mailto:kaihatsu.studio@gmail.com"
            className="hover:text-emerald-500 transition-colors"
          >
            Feedback
          </a>
        </div>
      </div>
    </footer>
  );
}
