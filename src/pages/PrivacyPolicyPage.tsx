import React from 'react';

const PrivacyPolicyPage: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="card-nb">
        <h1 className="mb-6">Privacy Policy</h1>
        <p className="text-theme-secondary mb-4">Last updated: June 22, 2026</p>

        <section className="mb-6">
          <h3 className="mb-2">Data We Collect</h3>
          <p className="text-theme-secondary mb-2">
            Poker Tracker collects and stores the following data:
          </p>
          <ul className="list-disc pl-6 text-theme-secondary space-y-1">
            <li>
              <strong>Google Account Information:</strong> When you connect your
              Google account, we access your name, email address, and profile
              picture solely for authentication purposes.
            </li>
            <li>
              <strong>Poker Session Data:</strong> Player names, buy-in amounts,
              cash-out amounts, session dates, stakes, and locations that you
              manually enter into the app.
            </li>
            <li>
              <strong>Spreadsheet Data:</strong> If you link a Google Sheet, we
              read data from that sheet and may write session data back to it
              for synchronization.
            </li>
          </ul>
        </section>

        <section className="mb-6">
          <h3 className="mb-2">How We Use Your Data</h3>
          <ul className="list-disc pl-6 text-theme-secondary space-y-1">
            <li>To display poker session statistics and balance history.</li>
            <li>To synchronize data between devices via Google Sheets.</li>
            <li>
              To persist your session data locally in your browser's storage.
            </li>
          </ul>
        </section>

        <section className="mb-6">
          <h3 className="mb-2">Data Storage & Sharing</h3>
          <p className="text-theme-secondary mb-2">
            All data is stored locally in your browser. If you connect a Google
            account and link a Google Sheet, data is also stored in that
            spreadsheet under your control. We do not collect, sell, share, or
            transfer your data to any third parties.
          </p>
        </section>

        <section className="mb-6">
          <h3 className="mb-2">Google API Data</h3>
          <p className="text-theme-secondary">
            This app uses Google APIs (Drive and Sheets) only when you
            explicitly connect your Google account. Data accessed via Google
            APIs is used solely to read and write your poker session data to the
            spreadsheet you specify. We comply with the Google API Services User
            Data Policy, including the Limited Use requirements.
          </p>
        </section>

        <section className="mb-6">
          <h3 className="mb-2">Data Deletion</h3>
          <p className="text-theme-secondary">
            You can delete all locally stored data at any time by clearing your
            browser's storage for this site. To remove data from a linked Google
            Sheet, you can delete the sheet or remove the data manually.
            Disconnecting your Google account will stop future synchronization
            but will not delete previously synced data from the spreadsheet.
          </p>
        </section>

        {/* <section className="mb-6">
          <h3 className="mb-2">Contact</h3>
          <p className="text-theme-secondary">
            If you have questions about this privacy policy, please contact the
            developer at the repository's issue tracker.
          </p>
        </section> */}
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
