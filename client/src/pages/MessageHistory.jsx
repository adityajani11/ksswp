import { useEffect, useMemo, useState } from "react";
import api, { getApiErrorMessage } from "../utils/api";
import Swal from "sweetalert2";
import { calculateCampaignProgress } from "../utils/campaignProgress";
import { runWithSwalLoader } from "../utils/swalLoading";
import {
  promptLoginPasswordForDelete,
  SECURITY_MODAL_OPTIONS,
  withActionPasswordHeader,
} from "../utils/security";

const FINAL_STATUSES = new Set([
  "completed",
  "completed_with_failures",
  "failed",
]);

function fmtDate(dateValue) {
  if (!dateValue) return "-";
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "-";

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();

  const rawHour = d.getHours();
  const hour = rawHour % 12 || 12;
  const minute = String(d.getMinutes()).padStart(2, "0");
  const second = String(d.getSeconds()).padStart(2, "0");
  const meridiem = rawHour >= 12 ? "PM" : "AM";

  return `${day} ${month} ${year}, ${hour}:${minute}:${second} ${meridiem}`;
}

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "completed") return "chip chip-success";
  if (s === "completed_with_failures") return "chip chip-warning";
  if (s === "failed") return "chip chip-danger";
  if (s === "processing") return "chip chip-primary";
  return "chip chip-neutral";
}

export default function MessageHistory() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("sent");
  const [deleting, setDeleting] = useState(false);

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c._id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId],
  );

  const fetchHistory = async ({
    preserveSelection = true,
    silent = false,
  } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      const res = await api.get("/whatsapp/queue/campaigns?limit=60&page=1");
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      setCampaigns(items);
      setSelectedCampaignId((prev) => {
        if (
          preserveSelection &&
          prev &&
          items.some((campaign) => campaign._id === prev)
        ) {
          return prev;
        }
        return items[0]?._id || null;
      });
    } catch (err) {
      if (!silent) {
        Swal.fire(
          "Error",
          getApiErrorMessage(err, "Failed to load message history"),
          "error",
        );
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const fetchDetails = async (campaignId, { silent = false } = {}) => {
    if (!campaignId) return;

    try {
      if (!silent) {
        setDetailsLoading(true);
      }
      const res = await api.get(
        `/whatsapp/queue/campaign/${campaignId}/recipients`,
      );
      setDetails({
        campaign: res.data?.campaign || null,
        delivery: res.data?.delivery || null,
        sentRecipients: Array.isArray(res.data?.sentRecipients)
          ? res.data.sentRecipients
          : [],
        unsentRecipients: Array.isArray(res.data?.unsentRecipients)
          ? res.data.unsentRecipients
          : [],
      });
    } catch (err) {
      if (!silent) {
        Swal.fire(
          "Error",
          getApiErrorMessage(err, "Failed to load campaign details"),
          "error",
        );
      }
    } finally {
      if (!silent) {
        setDetailsLoading(false);
      }
    }
  };

  const refreshCampaignSummary = async (
    campaignId,
    { silent = false } = {},
  ) => {
    if (!campaignId) return;

    try {
      const res = await api.get(`/whatsapp/queue/campaign/${campaignId}`);
      const campaign = res.data?.campaign || null;
      if (!campaign) return;

      setDetails((prev) => {
        if (!prev) return prev;
        return { ...prev, campaign };
      });

      setCampaigns((prev) =>
        prev.map((item) =>
          item._id === campaignId ? { ...item, ...campaign } : item,
        ),
      );
    } catch (err) {
      if (!silent) {
        Swal.fire(
          "Error",
          getApiErrorMessage(err, "Failed to refresh campaign progress"),
          "error",
        );
      }
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    if (!selectedCampaignId) return;
    fetchDetails(selectedCampaignId);
    setActiveTab("sent");
  }, [selectedCampaignId]);

  useEffect(() => {
    const running =
      details?.campaign && !FINAL_STATUSES.has(details.campaign.status);

    if (!running) return undefined;

    let tick = 0;
    const interval = setInterval(() => {
      refreshCampaignSummary(selectedCampaignId, { silent: true });
      tick += 1;
      if (tick % 3 === 0) {
        fetchHistory({ silent: true });
      }
      if (tick % 6 === 0) {
        fetchDetails(selectedCampaignId, { silent: true });
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [details?.campaign?.status, selectedCampaignId]);

  const deleteSelectedHistory = async () => {
    if (!selectedCampaignId) return;

    const result = await Swal.fire({
      title: "Delete this history?",
      text: "Only completed/failed campaign history can be deleted.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
      ...SECURITY_MODAL_OPTIONS,
    });

    if (!result.isConfirmed) return;

    const loginPassword = await promptLoginPasswordForDelete();
    if (!loginPassword) return;

    try {
      setDeleting(true);
      await runWithSwalLoader(
        {
          title: "Deleting history",
          text: "Removing this campaign history...",
        },
        () =>
          api.delete(
            `/whatsapp/queue/campaign/${selectedCampaignId}`,
            withActionPasswordHeader(loginPassword),
          ),
      );
      setDetails(null);
      setSelectedCampaignId(null);
      await fetchHistory({ preserveSelection: false });
      Swal.fire("Deleted", "Campaign history deleted.", "success");
    } catch (err) {
      Swal.fire(
        "Error",
        err.response?.data?.message || "Failed to delete campaign history",
        "error",
      );
    } finally {
      setDeleting(false);
    }
  };

  const clearPreviousHistory = async () => {
    const result = await Swal.fire({
      title: "Clear previous history?",
      text: "This will delete all completed/failed campaign history.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Clear All",
      confirmButtonColor: "#dc2626",
      ...SECURITY_MODAL_OPTIONS,
    });

    if (!result.isConfirmed) return;

    const loginPassword = await promptLoginPasswordForDelete();
    if (!loginPassword) return;

    try {
      setDeleting(true);
      const res = await runWithSwalLoader(
        {
          title: "Clearing history",
          text: "Removing previous campaign history...",
        },
        () =>
          api.delete(
            "/whatsapp/queue/campaigns",
            withActionPasswordHeader(loginPassword),
          ),
      );
      setDetails(null);
      setSelectedCampaignId(null);
      await fetchHistory({ preserveSelection: false });
      Swal.fire(
        "Cleared",
        `Deleted ${res.data?.deletedCount || 0} history item(s).`,
        "success",
      );
    } catch (err) {
      Swal.fire(
        "Error",
        err.response?.data?.message || "Failed to clear history",
        "error",
      );
    } finally {
      setDeleting(false);
    }
  };

  const currentProgress = calculateCampaignProgress(details?.campaign);
  const sentList = details?.sentRecipients || [];
  const unsentList = details?.unsentRecipients || [];
  const visibleRecipients = activeTab === "sent" ? sentList : unsentList;

  return (
    <div className="app-page app-page-wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Message History</h1>
        </div>
        <div className="page-actions">
          <button
            onClick={() => {
              fetchHistory();
              if (selectedCampaignId) fetchDetails(selectedCampaignId);
            }}
            className="btn btn-primary btn-sm"
          >
            Refresh
          </button>
          <button
            onClick={clearPreviousHistory}
            disabled={deleting}
            className="btn btn-danger btn-sm"
          >
            Clear History
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="app-card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3 font-medium">
            Campaigns
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loading ? (
              <p className="p-4 text-slate-500">Loading history...</p>
            ) : campaigns.length === 0 ? (
              <p className="p-4 text-slate-500">No campaign history found.</p>
            ) : (
              campaigns.map((item) => {
                const progress = calculateCampaignProgress(item);
                const isActive = selectedCampaignId === item._id;
                return (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => setSelectedCampaignId(item._id)}
                    className={`w-full border-b border-slate-200 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                      isActive ? "bg-blue-50/80" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize text-slate-900">
                        {item.type}
                      </span>
                      <span className={statusClass(item.status)}>
                        {String(item.status || "").replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-slate-600">
                      {item.text}
                    </p>
                    <div className="mt-1 text-xs text-slate-500">
                      Created: {fmtDate(item.createdAt)}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      Sent: {progress.sent} | Unsent:{" "}
                      {progress.failed + progress.pending}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="app-card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3 font-medium">
            Acknowledgement List
          </div>

          {!selectedCampaignId ? (
            <p className="p-4 text-slate-500">
              Select a campaign to view details.
            </p>
          ) : detailsLoading && !details ? (
            <p className="p-4 text-slate-500">Loading campaign details...</p>
          ) : !details?.campaign ? (
            <p className="p-4 text-slate-500">Campaign details unavailable.</p>
          ) : (
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium capitalize">
                    {details.campaign.type} campaign
                  </span>
                  <span className={statusClass(details.campaign.status)}>
                    {String(details.campaign.status || "").replaceAll("_", " ")}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${currentProgress.percent}%` }}
                  />
                </div>
                <div className="text-xs text-slate-600">
                  {currentProgress.percent}% completed | Sent:{" "}
                  {currentProgress.sent} | Unsent:{" "}
                  {currentProgress.failed + currentProgress.pending}
                </div>
                <div className="text-xs text-slate-500">
                  Sent time start: {fmtDate(details.campaign.startedAt)} | End:{" "}
                  {fmtDate(details.campaign.completedAt)}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("sent")}
                  className={`btn btn-sm ${
                    activeTab === "sent" ? "btn-success" : "btn-secondary"
                  }`}
                >
                  Sent ({sentList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("unsent")}
                  className={`btn btn-sm ${
                    activeTab === "unsent" ? "btn-danger" : "btn-secondary"
                  }`}
                >
                  Unsent ({unsentList.length})
                </button>
                <button
                  type="button"
                  onClick={deleteSelectedHistory}
                  disabled={deleting}
                  className="btn btn-danger btn-sm"
                >
                  Delete This
                </button>
              </div>

              <div className="app-list max-h-[45vh] overflow-y-auto">
                {visibleRecipients.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">No entries.</p>
                ) : (
                  visibleRecipients.map((r) => (
                    <div key={r.to} className="app-list-item text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-900">
                          {r.name ? `${r.name} (+${r.to})` : `+${r.to}`}
                        </span>
                        <span
                          className={
                            r.status === "sent"
                              ? "chip chip-success"
                              : "chip chip-danger"
                          }
                        >
                          {r.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Sent At: {fmtDate(r.sentAt)}
                      </div>
                      <div className="text-xs text-slate-600">
                        Last Tried: {fmtDate(r.lastTriedAt)}
                      </div>
                      <div className="text-xs text-slate-600">
                        Delivery: {r.deliveryStatus || "pending"}
                      </div>
                      {r.lastError ? (
                        <div className="mt-1 text-xs text-red-600">
                          Error: {r.lastError}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedCampaign?.lastError ? (
        <div className="app-inline-note app-inline-note-danger text-sm">
          Last error: {selectedCampaign.lastError}
        </div>
      ) : null}
    </div>
  );
}
