export default function Privacy() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <div className="prose dark:prose-invert">
        <p className="mb-4">Last updated: August 28, 2026</p>
        <p className="mb-4">
          At Meguruto, we take your privacy seriously. This Privacy Policy
          explains how we collect, use, and protect your personal information.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4">
          Information We Collect
        </h2>
        <p className="mb-4">
          - <strong>Account Information:</strong> When you sign up, we collect
          your email address and profile details through our authentication
          provider (Supabase).
          <br />- <strong>Usage Data:</strong> We store your saved trips,
          favorite destinations, and application preferences to provide a
          personalized experience.
          <br />- <strong>Analytics Data:</strong> We use Google Analytics 4,
          provided by Google, on the production site to understand page views,
          navigation, and acquisition sources. It may collect page URLs,
          referring URLs, browser/device information, and approximate location
          through cookies and similar technologies. Meguruto does not send
          account names or email addresses to Google Analytics.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4">
          How We Use Your Information
        </h2>
        <p className="mb-4">
          We use the information we collect to operate, maintain, and improve
          our services, as well as to personalize your trip planning experience.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4">Data Protection</h2>
        <p className="mb-4">
          Your data is stored securely using industry-standard encryption. We do
          not sell your personal data to third parties.
        </p>
        <p className="mb-4">
          For privacy questions, contact info@meguruto.app.
        </p>
      </div>
    </div>
  );
}
