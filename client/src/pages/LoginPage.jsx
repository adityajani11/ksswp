import Login from "../components/Login";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const navigate = useNavigate();

  const handleLogin = (token) => {
    localStorage.setItem("token", token);
    navigate("/dashboard/groups");
  };

  return (
    <div className="auth-shell">
      <div className="auth-frame">
        <section className="auth-brand-panel">
          <span className="auth-kicker">Messaging Operations</span>
          <h1 className="auth-heading">A calmer, sharper control panel for every campaign.</h1>
          <p className="auth-copy">
            Keep your messaging workflows organized with a consistent dashboard,
            clearer actions, and responsive tools built for day-to-day admin
            work.
          </p>

          <div className="auth-points">
            <div className="auth-point">
              <strong className="shrink-0 text-blue-700">01</strong>
              <span>Manage groups, batches, and imports from a unified workspace.</span>
            </div>
            <div className="auth-point">
              <strong className="shrink-0 text-blue-700">02</strong>
              <span>Queue text, image, video, and document campaigns with the same flow.</span>
            </div>
            <div className="auth-point">
              <strong className="shrink-0 text-blue-700">03</strong>
              <span>Review history, update settings, and export data without losing context.</span>
            </div>
          </div>
        </section>

        <section className="auth-form-panel">
          <Login onLogin={handleLogin} />
        </section>
      </div>
    </div>
  );
}
