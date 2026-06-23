import React from 'react';

const TermsOfServicePage: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="card-nb">
        <h1 className="mb-6">Terms of Service</h1>
        <p className="text-theme-secondary mb-4">Last updated: June 22, 2026</p>

        <section className="mb-6">
          <h3 className="mb-2">Acceptance of Terms</h3>
          <p className="text-theme-secondary">
            By using Poker Tracker, you agree to these Terms of Service. If you
            do not agree, do not use the application.
          </p>
        </section>

        <section className="mb-6">
          <h3 className="mb-2">Description of Service</h3>
          <p className="text-theme-secondary">
            Poker Tracker is a web application that allows users to record poker
            game sessions, track player statistics, and visualize balance
            history. The app can operate entirely in local mode (browser
            storage) or optionally synchronize data with Google Sheets when a
            Google account is connected.
          </p>
        </section>

        <section className="mb-6">
          <h3 className="mb-2">User Responsibilities</h3>
          <ul className="list-disc pl-6 text-theme-secondary space-y-1">
            <li>You are responsible for the accuracy of the data you enter.</li>
            <li>
              You are responsible for maintaining the confidentiality of any
              Google account credentials used with the app.
            </li>
            <li>
              You agree not to use the app for any unlawful purpose or in
              violation of any applicable laws.
            </li>
            <li>You are responsible for your losses.</li>
          </ul>
        </section>

        <section className="mb-6">
          <h3 className="mb-2">Third-Party Services</h3>
          <p className="text-theme-secondary">
            This app uses Google OAuth and Google Sheets API. Your use of these
            services is subject to Google's Terms of Service and Privacy Policy.
            This app is not affiliated with or endorsed by Google.
          </p>
        </section>

        <section className="mb-6">
          <h3 className="mb-2">Disclaimer</h3>
          <p className="text-theme-secondary">
            This application is provided "as is" without warranty of any kind,
            express or implied. The developers are not responsible for any data
            loss, inaccuracies, or damages arising from the use of this
            application.
          </p>
        </section>

        <section className="mb-6">
          <h3 className="mb-2">Changes to Terms</h3>
          <p className="text-theme-secondary">
            We reserve the right to modify these terms at any time. Changes will
            be posted on this page with an updated revision date.
          </p>
        </section>
      </div>
    </div>
  );
};

export default TermsOfServicePage;
