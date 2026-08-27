import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Boxes,
  CheckCircle2,
  Clock3,
  Database,
  ListRestart,
  Play,
  RefreshCw,
  Rocket,
  Server,
  Terminal,
} from "lucide-react";
import "./styles.css";

const commandHints = [
  "docker compose ps",
  "docker compose logs --tail=20 backend",
  "docker compose logs --tail=20 worker",
  'docker compose exec postgres psql -U dockyard -d dockyard -c "SELECT id, name, status FROM deployments ORDER BY id DESC;"',
  "docker compose exec redis redis-cli LLEN dockyard:queue:deployments",
];

const serviceIcons = {
  frontend: Boxes,
  backend: Server,
  postgres: Database,
  redis: ListRestart,
  worker: Activity,
};

function App() {
  const [activeTab, setActiveTab] = useState("deployments");
  const apiBaseUrl = useMemo(
    () => import.meta.env.VITE_API_BASE_URL || "http://localhost:8080",
    []
  );

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Docker learning dashboard</p>
          <h1>Dockyard</h1>
        </div>
        <div className="api-pill">
          <Activity size={16} />
          <span>{apiBaseUrl}</span>
        </div>
      </section>

      <nav className="tabs" aria-label="Dashboard tabs">
        <button
          className={activeTab === "deployments" ? "active" : ""}
          onClick={() => setActiveTab("deployments")}
        >
          <Rocket size={16} />
          Deployments
        </button>
        <button
          className={activeTab === "services" ? "active" : ""}
          onClick={() => setActiveTab("services")}
        >
          <Boxes size={16} />
          Platform Services
        </button>
      </nav>

      {activeTab === "deployments" ? (
        <Deployments apiBaseUrl={apiBaseUrl} />
      ) : (
        <PlatformServices apiBaseUrl={apiBaseUrl} />
      )}
    </main>
  );
}

function Deployments({ apiBaseUrl }) {
  const [deployments, setDeployments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function loadDeployments({ keepSelection = true } = {}) {
    setError("");
    setLoading(true);

    try {
      const data = await fetchJson(`${apiBaseUrl}/deployments`);
      const nextDeployments = data.deployments || [];
      setDeployments(nextDeployments);

      if (!keepSelection || !selectedId) {
        setSelectedId(nextDeployments[0]?.id || null);
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  async function createDeployment() {
    setCreating(true);
    setError("");

    try {
      const data = await fetchJson(`${apiBaseUrl}/deployments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `dashboard deployment ${new Date().toLocaleTimeString()}`,
        }),
      });

      setSelectedId(data.deployment.id);
      await loadDeployments({ keepSelection: true });
    } catch (createError) {
      setError(createError.message);
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    void loadDeployments({ keepSelection: false });
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return undefined;
    }

    let cancelled = false;

    async function loadDetail() {
      try {
        const data = await fetchJson(`${apiBaseUrl}/deployments/${selectedId}`);

        if (!cancelled) {
          setDetail(data);
          setDeployments((currentDeployments) =>
            currentDeployments.map((deployment) =>
              deployment.id === data.deployment.id ? data.deployment : deployment
            )
          );
        }
      } catch (detailError) {
        if (!cancelled) {
          setError(detailError.message);
        }
      }
    }

    void loadDetail();
    const timer = setInterval(loadDetail, 1500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [apiBaseUrl, selectedId]);

  return (
    <section className="workspace">
      <div className="panel stack">
        <div className="panel-heading">
          <div>
            <h2>Deployments</h2>
            <p>Durable records from PostgreSQL.</p>
          </div>
          <div className="button-row">
            <button onClick={() => loadDeployments()} title="Refresh">
              <RefreshCw size={16} />
            </button>
            <button
              className="primary"
              disabled={creating}
              onClick={createDeployment}
            >
              <Play size={16} />
              {creating ? "Creating" : "Create"}
            </button>
          </div>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {loading ? <p className="muted">Loading deployments...</p> : null}

        <div className="deployment-list">
          {deployments.map((deployment) => (
            <button
              className={deployment.id === selectedId ? "active" : ""}
              key={deployment.id}
              onClick={() => setSelectedId(deployment.id)}
            >
              <span>{deployment.name}</span>
              <StatusBadge status={deployment.status} />
            </button>
          ))}
        </div>

        {!loading && deployments.length === 0 ? (
          <div className="empty-state">
            <Rocket size={32} />
            <strong>No deployments yet</strong>
            <span>
              Create one to send work through PostgreSQL, Redis, and the worker.
            </span>
          </div>
        ) : null}
      </div>

      <div className="panel stack">
        <div className="panel-heading">
          <div>
            <h2>Timeline</h2>
            <p>Application logs stored by deployment id.</p>
          </div>
          <Clock3 size={20} />
        </div>

        {detail ? (
          <>
            <div className="detail-summary">
              <strong>{detail.deployment.name}</strong>
              <StatusBadge status={detail.deployment.status} />
            </div>
            <ol className="timeline">
              {detail.logs.map((entry) => (
                <li key={entry.id}>
                  <CheckCircle2 size={16} />
                  <div>
                    <strong>{entry.message}</strong>
                    <span>{formatDate(entry.created_at)}</span>
                  </div>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="muted">Select a deployment to inspect its timeline.</p>
        )}
      </div>
    </section>
  );
}

function PlatformServices({ apiBaseUrl }) {
  const [services, setServices] = useState([]);
  const [error, setError] = useState("");

  async function loadServices() {
    setError("");

    try {
      const data = await fetchJson(`${apiBaseUrl}/platform-services`);
      setServices(data.services || []);
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  useEffect(() => {
    void loadServices();
    const timer = setInterval(loadServices, 4000);

    return () => clearInterval(timer);
  }, [apiBaseUrl]);

  return (
    <section className="workspace">
      <div className="panel stack wide">
        <div className="panel-heading">
          <div>
            <h2>Platform Services</h2>
            <p>App-level checks only.</p>
          </div>
          <button onClick={loadServices} title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="service-grid">
          {services.map((service) => {
            const Icon = serviceIcons[service.name] || Activity;

            return (
              <article className="service-card" key={service.name}>
                <div>
                  <h3>
                    <Icon size={16} />
                    {service.name}
                  </h3>
                  <StatusBadge status={service.status} />
                </div>
                <p>{service.note}</p>
                {service.heartbeat ? (
                  <span className="service-meta">
                    Last seen {formatDate(service.heartbeat.lastSeenAt)}
                  </span>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>

      <div className="panel stack">
        <div className="panel-heading">
          <div>
            <h2>Command Hints</h2>
            <p>Manual Docker inspection.</p>
          </div>
          <Terminal size={20} />
        </div>
        <div className="command-list">
          {commandHints.map((command) => (
            <code key={command}>{command}</code>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ status }) {
  return <span className={`status ${status}`}>{status}</span>;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

function formatDate(value) {
  if (!value) {
    return "not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

createRoot(document.getElementById("root")).render(<App />);
