export default function AdminSettingsPage() {
  return (
    <>
      <div className="adminPageHead">
        <div>
          <div className="adminEyebrow">Control center</div>
          <h1>Settings</h1>
          <p>Site configuration, payment providers, email, and authentication settings.</p>
        </div>
      </div>
      <div className="adminPanel">
        <div style={{ padding: 24, textAlign: "center", color: "#777" }}>
          <p>Settings management coming soon. Connect to NestJS settings endpoints.</p>
        </div>
      </div>
    </>
  );
}