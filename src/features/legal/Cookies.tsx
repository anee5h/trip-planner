export default function Cookies() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6">Cookie Policy</h1>
      <div className="prose dark:prose-invert">
        <p className="mb-4">Last updated: August 28, 2026</p>
        <p className="mb-4">
          This Cookie Policy explains how Meguruto uses cookies and similar
          technologies to recognize you when you visit our website.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4">What are cookies?</h2>
        <p className="mb-4">
          Cookies are small data files that are placed on your computer or
          mobile device when you visit a website. They are widely used to make
          websites work more efficiently and provide a better user experience.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4">How we use cookies</h2>
        <p className="mb-4">
          We use strictly necessary cookies to enable core functionality such as
          security, network management, and account authentication (via
          Supabase). We also use local storage to save your application
          preferences (like dark mode and currency settings). Google Analytics 4
          may also use analytics cookies on the production site to measure page
          views, navigation, and acquisition sources; these cookies are not
          required for core functionality.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4">Managing cookies</h2>
        <p className="mb-4">
          You can set or amend your web browser controls to accept or refuse
          cookies. If you choose to reject cookies, you may still use our
          website, though your access to some functionality (like logging in)
          may be restricted.
        </p>
        <p className="mb-4">For cookie questions, contact info@meguruto.app.</p>
      </div>
    </div>
  );
}
