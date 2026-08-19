export const designTokens = {
  spacing: {
    xs: "4px", // 4px
    sm: "8px", // 8px
    md: "12px", // 12px (deprecated - migrate to sm or base)
    base: "16px", // 16px
    lg: "16px", // 16px
    xl: "24px", // 24px
    xxl: "32px", // 32px
    xxxl: "48px", // 48px
    layout: "64px", // 64px
    huge: "96px", // 96px
  },
  radii: {
    button: "12px",
    card: "16px",
    image: "16px",
    dialog: "20px",
    pill: "9999px",
  },
  shadows: {
    card: "0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
    hover: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    modal:
      "0 20px 25px -5px rgb(0 0 0 / 0.15), 0 8px 10px -6px rgb(0 0 0 / 0.15)",
  },
  colors: {
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
    info: "#3b82f6",
  },
  typography: {
    hero: "text-[48px] font-extrabold leading-tight tracking-tight",
    sectionTitle: "text-[32px] font-bold leading-snug",
    pageTitle: "text-[28px] font-bold leading-snug",
    cardTitle: "text-[20px] font-bold leading-normal",
    body: "text-[16px] font-normal leading-relaxed",
    secondary:
      "text-[14px] font-medium leading-relaxed text-slate-500 dark:text-slate-300",
    caption:
      "text-[12px] font-medium leading-none text-slate-500 dark:text-slate-300",
  },
};
