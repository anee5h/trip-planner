import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import i18n from "i18next";
import { reportError } from "@/shared/utils/errorReporter";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    // KAI-46: report route crashes to the error pipeline (privacy-safe).
    reportError(error, "react-boundary");
  }

  public render() {
    if (this.state.hasError) {
      const isJa = i18n.language === "ja";
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
          <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-full mb-6">
            <AlertTriangle className="w-12 h-12 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold mb-3 text-slate-900 dark:text-white">
            {isJa ? "問題が発生しました" : "Something went wrong"}
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-6 max-w-md">
            {isJa
              ? "コンテンツの読み込み中に予期しないエラーが発生しました。ページを再読み込みしてください。"
              : "We encountered an unexpected error while trying to load this content. Please try refreshing the page."}
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => window.location.reload()}
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {isJa ? "ページを再読み込み" : "Reload Page"}
            </Button>
            <Button
              variant="outline"
              onClick={() => this.setState({ hasError: false })}
            >
              {isJa ? "もう一度試す" : "Try Again"}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
