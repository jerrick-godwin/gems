import { History } from "lucide-react";
import { useEffect, useState } from "react";
import type { GemsAdminApiClient } from "@gems/api-client";
import type { AdminAuditLogPage } from "@gems/schemas";
import { publicErrorMessage } from "../../shared/helpers";

export function AdminAuditPanel({ api, token }: { api: GemsAdminApiClient; token: string }) {
  const [page, setPage] = useState<AdminAuditLogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.auditLogs(token, { limit: 50 })
      .then((nextPage) => { if (active) setPage(nextPage); })
      .catch((cause) => { if (active) setError(publicErrorMessage(cause, "Unable to load audit history")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, token]);

  const loadMore = async () => {
    if (!page?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = await api.auditLogs(token, { cursor: page.nextCursor, limit: 50 });
      setPage((current) => ({
        items: [...(current?.items ?? []), ...nextPage.items.filter((item) => !current?.items.some((existing) => existing.id === item.id))],
        nextCursor: nextPage.nextCursor
      }));
      setError("");
    } catch (cause) {
      setError(publicErrorMessage(cause, "Unable to load more audit history"));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="data-panel admin-data-section card card--surface" aria-labelledby="admin-audit-title">
      <div className="admin-section-header">
        <div>
          <span className="admin-panel-eyebrow">Accountability</span>
          <h2 id="admin-audit-title">Admin audit history</h2>
          <span>Trial, billing, moderation, reconciliation, and archival actions</span>
        </div>
        <History size={22} aria-hidden="true" />
      </div>
      {loading && <div className="admin-section-empty" role="status">Loading audit history...</div>}
      {error && <div className="admin-inline-error" role="alert">{error}</div>}
      {!loading && page?.items.length === 0 && <div className="admin-section-empty">No audited actions yet.</div>}
      {page && page.items.length > 0 && (
        <div className="admin-payment-list">
          {page.items.map((item) => (
            <article key={item.id} className="card card--inset card--compact">
              <div className="admin-panel-title-row">
                <div>
                  <strong>{item.action.replace(/_/g, " ")}</strong>
                  <span>{item.targetType.replace(/_/g, " ")} · {item.targetId}</span>
                </div>
                <span className={`status-${item.result}`}>{item.result}</span>
              </div>
              <div className="admin-muted">{item.actorEmail} · {new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</div>
            </article>
          ))}
          {page.nextCursor && (
            <div className="active-listing-actions">
              <button type="button" className="active-listing-action" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? "Loading..." : "Load more audit history"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
