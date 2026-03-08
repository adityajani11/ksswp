import { useEffect, useMemo, useState } from "react";
import api from "../utils/api";
import Swal from "sweetalert2";
import { calculateCampaignProgress } from "../utils/campaignProgress";

const FINAL_STATUSES = new Set(["completed", "completed_with_failures", "failed"]);

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
  if (s === "completed") return "bg-green-100 text-green-700";
  if (s === "completed_with_failures") return "bg-amber-100 text-amber-700";
  if (s === "failed") return "bg-red-100 text-red-700";
  if (s === "processing") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-700";
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

  const fetchHistory = async ({ preserveSelection = true } = {}) => {
    try {
      setLoading(true);
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
      Swal.fire(
        "Error",
        err.response?.data?.message || "Failed to load message history",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchDetails = async (campaignId) => {
    if (!campaignId) return;

    try {
      setDetailsLoading(true);
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
      Swal.fire(
        "Error",
        err.response?.data?.message || "Failed to load campaign details",
        "error",
      );
    } finally {
      setDetailsLoading(false);
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
      fetchDetails(selectedCampaignId);
      tick += 1;
      if (tick % 3 === 0) {
        fetchHistory();
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
    });

    if (!result.isConfirmed) return;

    try {
      setDeleting(true);
      await api.delete(`/whatsapp/queue/campaign/${selectedCampaignId}`);
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
    });

    if (!result.isConfirmed) return;

    try {
      setDeleting(true);
      const res = await api.delete("/whatsapp/queue/campaigns");
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Message History</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              fetchHistory();
              if (selectedCampaignId) fetchDetails(selectedCampaignId);
            }}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded"
          >
            Refresh
          </button>
          <button
            onClick={clearPreviousHistory}
            disabled={deleting}
            className="px-3 py-2 text-sm bg-red-600 text-white rounded disabled:opacity-50"
          >
            Clear History
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b font-medium">Campaigns</div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loading ? (
              <p className="p-4 text-gray-500">Loading history...</p>
            ) : campaigns.length === 0 ? (
              <p className="p-4 text-gray-500">No campaign history found.</p>
            ) : (
              campaigns.map((item) => {
                const progress = calculateCampaignProgress(item);
                const isActive = selectedCampaignId === item._id;
                return (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => setSelectedCampaignId(item._id)}
                    className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 ${
                      isActive ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">{item.type}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${statusClass(item.status)}`}
                      >
                        {String(item.status || "").replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-1 mt-1">
                      {item.text}
                    </p>
                    <div className="text-xs text-gray-500 mt-1">
                      Created: {fmtDate(item.createdAt)}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      Sent: {progress.sent} | Unsent:{" "}
                      {progress.failed + progress.pending}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b font-medium">Acknowledgement List</div>

          {!selectedCampaignId ? (
            <p className="p-4 text-gray-500">Select a campaign to view details.</p>
          ) : detailsLoading && !details ? (
            <p className="p-4 text-gray-500">Loading campaign details...</p>
          ) : !details?.campaign ? (
            <p className="p-4 text-gray-500">Campaign details unavailable.</p>
          ) : (
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium capitalize">
                    {details.campaign.type} campaign
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${statusClass(details.campaign.status)}`}
                  >
                    {String(details.campaign.status || "").replaceAll("_", " ")}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${currentProgress.percent}%` }}
                  />
                </div>
                <div className="text-xs text-gray-600">
                  {currentProgress.percent}% completed | Sent:{" "}
                  {currentProgress.sent} | Unsent:{" "}
                  {currentProgress.failed + currentProgress.pending}
                </div>
                <div className="text-xs text-gray-500">
                  Sent time start: {fmtDate(details.campaign.startedAt)} | End:{" "}
                  {fmtDate(details.campaign.completedAt)}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("sent")}
                  className={`px-3 py-1 text-sm rounded ${
                    activeTab === "sent"
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  Sent ({sentList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("unsent")}
                  className={`px-3 py-1 text-sm rounded ${
                    activeTab === "unsent"
                      ? "bg-red-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  Unsent ({unsentList.length})
                </button>
                <button
                  type="button"
                  onClick={deleteSelectedHistory}
                  disabled={deleting}
                  className="px-3 py-1 text-sm rounded bg-red-600 text-white disabled:opacity-50"
                >
                  Delete This
                </button>
              </div>

              <div className="max-h-[45vh] overflow-y-auto border rounded">
                {visibleRecipients.length === 0 ? (
                  <p className="p-3 text-sm text-gray-500">No entries.</p>
                ) : (
                  visibleRecipients.map((r) => (
                    <div key={r.to} className="p-3 border-b text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {r.name ? `${r.name} (+${r.to})` : `+${r.to}`}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            r.status === "sent"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        Sent At: {fmtDate(r.sentAt)}
                      </div>
                      <div className="text-xs text-gray-600">
                        Last Tried: {fmtDate(r.lastTriedAt)}
                      </div>
                      <div className="text-xs text-gray-600">
                        Delivery: {r.deliveryStatus || "pending"}
                      </div>
                      {r.lastError ? (
                        <div className="text-xs text-red-600 mt-1">
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
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
          Last error: {selectedCampaign.lastError}
        </div>
      ) : null}
    </div>
  );
}
