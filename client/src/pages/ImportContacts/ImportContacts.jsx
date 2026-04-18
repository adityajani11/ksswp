import React, { useState, useEffect } from "react";
import api, { getApiErrorMessage } from "../../utils/api";
import { runWithSwalLoader } from "../../utils/swalLoading";
import Swal from "sweetalert2";
import {
  FileUp,
  Info,
  AlertTriangle,
  CheckCircle,
  Clock,
  Trash2,
  Trash,
  RefreshCw,
} from "lucide-react";

export default function ImportContacts() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch history on mount with abort support
  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const strHours = String(hours).padStart(2, "0");

    return `${day}/${month}/${year} ${strHours}:${minutes} ${ampm}`;
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return "< 1s";
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  const IMPORT_STATUS_POLL_INTERVAL_MS = 1200;

  const formatTimer = (seconds) => {
    const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
    const secs = String(seconds % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const getProgressPhaseText = (job) => {
    const phase = String(job?.phase || "").toLowerCase();
    const status = String(job?.status || "").toLowerCase();

    if (status === "completed" || phase === "completed") return "Completed";
    if (status === "cancelled" || phase === "cancelled") return "Cancelled";
    if (status === "failed" || phase === "failed") return "Failed";
    if (phase === "counting") return "Counting rows...";
    if (phase === "finalizing") return "Finalizing import...";
    if (phase === "processing") return "Importing contacts...";
    return "Preparing import...";
  };

  const getProgressEtaText = (job) => {
    const phase = String(job?.phase || "").toLowerCase();
    const progress = Number(job?.progress || 0);
    const etaSeconds = Math.max(0, Number(job?.eta || 0));
    const processed = Number(job?.processed || 0);

    if (phase === "counting") return "Analyzing workbook...";
    if (phase === "finalizing") return "Saving results...";
    if (phase === "completed") return "Completed";
    if (phase === "cancelled") return "Cancelled";

    if (etaSeconds > 0) {
      const mins = Math.floor(etaSeconds / 60);
      const secs = etaSeconds % 60;
      return `Remaining: ~${mins}m ${secs}s`;
    }

    if (progress >= 99) return "Wrapping up...";
    if (processed > 0) return "Calculating remaining time...";
    return "Starting import...";
  };

  const updateProgressDialog = ({ job, startTime }) => {
    const htmlContainer = Swal.getHtmlContainer();
    if (!htmlContainer) return;

    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - startTime) / 1000),
    );
    const total = Math.max(0, Number(job?.total || 0));
    const processed = Math.max(0, Number(job?.processed || 0));
    const imported = Math.max(0, Number(job?.imported || 0));
    const skipped = Math.max(0, Number(job?.skipped || 0));
    const progress = Math.max(
      0,
      Math.min(
        100,
        Number.isFinite(Number(job?.progress)) ? Number(job?.progress) : 0,
      ),
    );

    const timerEl = htmlContainer.querySelector("[data-prog-timer]");
    const etaEl = htmlContainer.querySelector("[data-prog-eta]");
    const percentEl = htmlContainer.querySelector("[data-prog-percent]");
    const statusEl = htmlContainer.querySelector("[data-prog-status]");
    const barEl = htmlContainer.querySelector("[data-prog-bar]");
    const countsEl = htmlContainer.querySelector("[data-prog-counts]");

    if (timerEl) timerEl.textContent = formatTimer(elapsedSeconds);
    if (etaEl) etaEl.textContent = getProgressEtaText(job);
    if (percentEl) percentEl.textContent = `${progress}%`;
    if (statusEl) statusEl.textContent = getProgressPhaseText(job);
    if (barEl) barEl.style.width = `${progress}%`;
    if (countsEl) {
      countsEl.textContent =
        total > 0
          ? `Processed ${Math.min(processed, total)}/${total} rows | Added ${imported} | Skipped ${skipped}`
          : `Processed ${processed} rows | Added ${imported} | Skipped ${skipped}`;
    }
  };

  const fetchHistory = async (signal) => {
    try {
      const res = await api.get("/import/history", { signal });
      setHistory(res.data);
    } catch (err) {
      if (err.name !== "CanceledError" && err.name !== "AbortError") {
        console.error("History fetch error:", err);
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchHistory();
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchHistory(controller.signal);
    return () => controller.abort();
  }, []);

  const handleDeleteHistory = async (id) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "This record will be permanently deleted from history.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, delete it!",
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/import/history/${id}`);
        setHistory((prev) => prev.filter((h) => h._id !== id));
        Swal.fire({
          icon: "success",
          title: "Deleted",
          text: "Record removed successfully.",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err) {
        Swal.fire(
          "Error",
          getApiErrorMessage(err, "Failed to delete record"),
          "error",
        );
      }
    }
  };

  const handleClearHistory = async () => {
    const result = await Swal.fire({
      title: "Clear All History?",
      text: "Every history record will be permanently deleted. This action cannot be undone.",
      icon: "error",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, clear all!",
    });

    if (result.isConfirmed) {
      try {
        await api.delete("/import/history/clear");
        setHistory([]);
        Swal.fire({
          icon: "success",
          title: "Cleared!",
          text: "All history records have been removed.",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err) {
        Swal.fire(
          "Error",
          getApiErrorMessage(err, "Failed to clear history"),
          "error",
        );
      }
    }
  };

  const getExportTimestamp = () => {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");

    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
      now.getHours(),
    )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  };

  const sanitizeFilePart = (value, fallback = "Import_History") => {
    const sanitized = String(value || "")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return sanitized || fallback;
  };

  const downloadSkipDetailsExcel = async (historyEntry) => {
    const details = Array.isArray(historyEntry?.skipDetails)
      ? historyEntry.skipDetails
      : [];
    if (!details.length) {
      Swal.fire(
        "No data",
        "No skipped details available to export.",
        "warning",
      );
      return;
    }

    try {
      await runWithSwalLoader(
        {
          title: "Exporting History",
          text: "Preparing selected record Excel...",
        },
        async () => {
          const XLSX = await import("xlsx");
          const workbook = XLSX.utils.book_new();

          const sheetRows = [
            ["Sheet", "Row", "Name", "Contact Number", "Reason"],
            ...details.map((item) => [
              String(item?.sheetName || "-"),
              Number.isFinite(Number(item?.row)) ? Number(item.row) : "-",
              String(item?.name || "(empty)"),
              String(item?.contact_number || "-"),
              String(item?.reason || "-"),
            ]),
          ];

          const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
          worksheet["!cols"] = [
            { wch: 22 },
            { wch: 10 },
            { wch: 28 },
            { wch: 20 },
            { wch: 42 },
          ];

          XLSX.utils.book_append_sheet(workbook, worksheet, "Skipped Details");
          const fileBase = sanitizeFilePart(
            historyEntry?.fileName,
            "Import_History",
          );
          XLSX.writeFile(
            workbook,
            `${fileBase}_Skipped_${getExportTimestamp()}.xlsx`,
          );
        },
      );
    } catch (err) {
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to export selected history"),
        "error",
      );
    }
  };

  const handleImportClick = async () => {
    const { value: file } = await Swal.fire({
      title: "Select Excel File",
      html: `
        <div style="text-align: left; margin-bottom: 20px; padding: 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; color: #92400e; font-size: 0.85rem; display: flex; gap: 10px;">
          <svg style="width: 20px; height: 20px; flex-shrink: 0; margin-top: 2px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <span><b>Required Format:</b> Your Excel file must contain columns named <b>'name'</b> and <b>'contact_number'</b> to map results correctly.</span>
        </div>
      `,
      input: "file",
      inputAttributes: {
        accept: ".xlsx, .xls",
        "aria-label": "Upload your contacts excel file",
      },
      showCancelButton: true,
      confirmButtonText: "Import",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#2563eb",
    });

    if (!file) return;

    // Verify extension
    const fileName = file.name;
    const extension = fileName.split(".").pop().toLowerCase();
    if (!["xlsx", "xls"].includes(extension)) {
      Swal.fire(
        "Error",
        "Please select a valid Excel file (.xlsx or .xls)",
        "error",
      );
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Step 1: Upload and start import job
      const uploadRes = await runWithSwalLoader(
        {
          title: "Uploading File",
          text: "Please wait while we send the Excel to the server...",
        },
        () =>
          api.post("/import/upload", formData, {
            headers: { "Content-Type": "multipart/form-data" },
          }),
      );

      if (!uploadRes?.data?.jobId) return;
      const { jobId } = uploadRes.data;

      const startTime = Date.now();
      let pollTimeout;
      let timerInterval;
      let pollingStopped = false;
      let latestJobSnapshot = null;
      let completedJobSnapshot = null;
      let terminalJobSnapshot = null;

      const stopPolling = () => {
        pollingStopped = true;
        if (pollTimeout) {
          clearTimeout(pollTimeout);
          pollTimeout = null;
        }
      };

      const pollStatus = async () => {
        if (pollingStopped) return;

        try {
          const { data: job } = await api.get(`/import/status/${jobId}`);
          latestJobSnapshot = job;
          updateProgressDialog({ job, startTime });

          const status = String(job?.status || "").toLowerCase();
          if (status === "completed") {
            completedJobSnapshot = job;
            stopPolling();
            Swal.close();
            return;
          }

          if (status === "failed" || status === "cancelled") {
            terminalJobSnapshot = job;
            stopPolling();
            Swal.close();
            return;
          }
        } catch (err) {
          if (err.name !== "CanceledError" && err.name !== "AbortError") {
            console.error("Polling error:", err);
          }
        }

        if (!pollingStopped) {
          pollTimeout = setTimeout(pollStatus, IMPORT_STATUS_POLL_INTERVAL_MS);
        }
      };

      const modalResult = await Swal.fire({
        title: "Importing Contacts",
        html: `
          <div style="text-align: center; margin-top: 15px;">
            <div data-prog-timer style="font-size: 2.2rem; font-weight: 800; color: #1e293b; font-variant-numeric: tabular-nums; margin-bottom: 5px;">00:00</div>
            <div data-prog-eta style="font-size: 0.85rem; color: #64748b; margin-bottom: 25px;">Preparing import...</div>

            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem; font-weight: 600;">
              <span data-prog-percent style="color: #2563eb;">0%</span>
              <span data-prog-status style="color: #64748b; font-weight: 500;">Preparing import...</span>
            </div>
            <div style="width: 100%; height: 12px; background: #e2e8f0; border-radius: 6px; overflow: hidden; margin-bottom: 10px;">
              <div data-prog-bar style="width: 0%; height: 100%; background: linear-gradient(90deg, #3b82f6, #2563eb); transition: width 0.3s ease;"></div>
            </div>
            <div data-prog-counts style="font-size: 0.85rem; color: #475569; text-align: left;">
              Processed 0 rows | Added 0 | Skipped 0
            </div>
          </div>
        `,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: true,
        confirmButtonText: "Cancel Import",
        confirmButtonColor: "#ef4444",
        didOpen: () => {
          updateProgressDialog({ job: null, startTime });

          timerInterval = setInterval(() => {
            updateProgressDialog({
              job: latestJobSnapshot,
              startTime,
            });
          }, 1000);

          pollStatus();
        },
        willClose: () => {
          stopPolling();
          clearInterval(timerInterval);
        },
      });

      stopPolling();
      clearInterval(timerInterval);

      if (completedJobSnapshot) {
        const importedCount = Math.max(
          0,
          Number(
            completedJobSnapshot.imported ||
              completedJobSnapshot?.history?.totalImported ||
              0,
          ),
        );
        const durationSeconds = Math.max(
          1,
          Number(
            completedJobSnapshot.durationSeconds ||
              Math.floor((Date.now() - startTime) / 1000),
          ),
        );

        await Swal.fire({
          icon: "success",
          title: "Import Successful",
          html: `
            <div style="text-align: center;">
              <p style="font-size: 1rem; color: #64748b; margin-bottom: 15px;">Your contacts have been successfully imported.</p>
              <div style="display: flex; justify-content: center; gap: 20px; margin-bottom: 10px;">
                <div style="text-align: center;">
                  <div style="font-size: 1.2rem; font-weight: 700; color: #1e293b;">${importedCount}</div>
                  <div style="font-size: 0.75rem; color: #64748b; text-transform: uppercase;">Added</div>
                </div>
                <div style="width: 1px; background: #e2e8f0;"></div>
                <div style="text-align: center;">
                  <div style="font-size: 1.2rem; font-weight: 700; color: #1e293b;">${formatDuration(durationSeconds)}</div>
                  <div style="font-size: 0.75rem; color: #64748b; text-transform: uppercase;">Time Taken</div>
                </div>
              </div>
            </div>
          `,
          confirmButtonText: "Close",
          confirmButtonColor: "#2563eb",
        });
        fetchHistory();
        return;
      }

      if (terminalJobSnapshot) {
        const isCancelled =
          String(terminalJobSnapshot?.status || "").toLowerCase() ===
          "cancelled";
        await Swal.fire(
          isCancelled ? "Import Cancelled" : "Import Failed",
          terminalJobSnapshot?.error ||
            (isCancelled
              ? "Import was cancelled."
              : "Import processing failed."),
          isCancelled ? "info" : "error",
        );
        return;
      }

      if (modalResult.isConfirmed) {
        try {
          const cancelRes = await api.post(`/import/cancel/${jobId}`);
          const cancelStatus = String(
            cancelRes?.data?.status || "",
          ).toLowerCase();

          if (cancelStatus === "completed") {
            const { data: finalJob } = await api.get(`/import/status/${jobId}`);
            const importedCount = Math.max(
              0,
              Number(
                finalJob.imported || finalJob?.history?.totalImported || 0,
              ),
            );
            const durationSeconds = Math.max(
              1,
              Number(
                finalJob.durationSeconds ||
                  Math.floor((Date.now() - startTime) / 1000),
              ),
            );

            await Swal.fire({
              icon: "success",
              title: "Import Successful",
              html: `
                <div style="text-align: center;">
                  <p style="font-size: 1rem; color: #64748b; margin-bottom: 15px;">The import finished before cancellation.</p>
                  <div style="display: flex; justify-content: center; gap: 20px; margin-bottom: 10px;">
                    <div style="text-align: center;">
                      <div style="font-size: 1.2rem; font-weight: 700; color: #1e293b;">${importedCount}</div>
                      <div style="font-size: 0.75rem; color: #64748b; text-transform: uppercase;">Added</div>
                    </div>
                    <div style="width: 1px; background: #e2e8f0;"></div>
                    <div style="text-align: center;">
                      <div style="font-size: 1.2rem; font-weight: 700; color: #1e293b;">${formatDuration(durationSeconds)}</div>
                      <div style="font-size: 0.75rem; color: #64748b; text-transform: uppercase;">Time Taken</div>
                    </div>
                  </div>
                </div>
              `,
              confirmButtonText: "Close",
              confirmButtonColor: "#2563eb",
            });
            fetchHistory();
            return;
          }

          await Swal.fire(
            "Import Cancelled",
            "Import has been cancelled. Partial data for this run was rolled back.",
            "info",
          );
          fetchHistory();
        } catch (err) {
          Swal.fire(
            "Error",
            getApiErrorMessage(err, "Failed to cancel import"),
            "error",
          );
        }
      }
    } catch (err) {
      if (err.name !== "CanceledError" && err.name !== "AbortError") {
        console.error("Import start error:", err);
        Swal.fire(
          "Error",
          getApiErrorMessage(err, "Failed to start import task"),
          "error",
        );
      }
    }
  };

  const showSkipDetails = async (historyEntry) => {
    const details = Array.isArray(historyEntry?.skipDetails)
      ? historyEntry.skipDetails
      : [];
    if (!details || details.length === 0) return;

    let html = `
      <div style="max-height: 400px; overflow-y: auto; text-align: left; font-size: 0.85rem;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 2px solid #eee;">
              <th style="padding: 8px;">Sheet</th>
              <th style="padding: 8px;">Row</th>
              <th style="padding: 8px;">Name</th>
              <th style="padding: 8px;">Contact Number</th>
              <th style="padding: 8px;">Reason</th>
            </tr>
          </thead>
          <tbody>
    `;

    details.forEach((d) => {
      html += `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px;">${d.sheetName || "-"}</td>
          <td style="padding: 8px;">${d.row || "-"}</td>
          <td style="padding: 8px;">${d.name || "(empty)"}</td>
          <td style="padding: 8px;">${d.contact_number || "-"}</td>
          <td style="padding: 8px; color: #d33;">${d.reason}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    const result = await Swal.fire({
      title: "Skipped Contacts Details",
      html: html,
      width: "800px",
      confirmButtonText: "Close",
      showDenyButton: true,
      denyButtonText: "Download Excel",
      denyButtonColor: "#059669",
    });

    if (result.isDenied) {
      await downloadSkipDetailsExcel(historyEntry);
    }
  };

  return (
    <div className="app-page app-page-wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Import Contacts</h1>
        </div>
        <div className="page-actions">
          {history.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="btn btn-ghost-danger"
              title="Clear all import history"
            >
              <Trash size={18} />
              <span className="hidden sm:inline">Clear History</span>
            </button>
          )}
          <button onClick={handleImportClick} className="btn btn-primary">
            <FileUp size={20} />
            Import
          </button>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 p-4">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-slate-500" />
            <h2 className="font-semibold text-slate-700">Import History</h2>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`btn btn-secondary btn-icon ${isRefreshing ? "opacity-50" : ""}`}
            title="Refresh History"
          >
            <RefreshCw
              size={18}
              className={isRefreshing ? "animate-spin" : ""}
            />
          </button>
        </div>

        <div>
          {loading ? (
            <div className="p-12 text-center font-medium text-slate-500">
              Loading history...
            </div>
          ) : history.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <Info size={32} className="text-slate-400" />
              </div>
              <p className="text-slate-500">No import history found.</p>
              <p className="mt-1 text-sm text-slate-400">
                Start by clicking the "Import" button above.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden md:block app-table-wrap">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>File Name</th>
                      <th>Time</th>
                      <th>Imported</th>
                      <th>Skipped</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h._id}>
                        <td className="whitespace-nowrap text-sm text-slate-600">
                          {formatDate(h.createdAt)}
                        </td>
                        <td>
                          <span className="line-clamp-1 font-medium text-slate-800">
                            {h.fileName}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
                            <Clock size={16} />
                            {formatDuration(h.duration)}
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5 text-sm font-semibold text-green-600">
                            <CheckCircle size={16} />
                            {h.totalImported}
                          </div>
                        </td>
                        <td>
                          <div
                            className={`flex items-center gap-1.5 text-sm font-semibold ${h.totalSkipped > 0 ? "text-amber-600" : "text-slate-400"}`}
                          >
                            <AlertTriangle size={16} />
                            {h.totalSkipped}
                          </div>
                        </td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-3 transition-opacity">
                            {h.totalSkipped > 0 && (
                              <button
                                onClick={() => showSkipDetails(h)}
                                className="text-sm font-medium text-blue-600 underline underline-offset-4 transition-colors hover:text-blue-800"
                              >
                                View Skipped
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteHistory(h._id)}
                              className="btn btn-secondary btn-icon text-slate-400 hover:text-red-600"
                              title="Delete individual record"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-100 md:hidden">
                {history.map((h) => (
                  <div
                    key={h._id}
                    className="p-4 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div
                          className="truncate font-semibold text-slate-800"
                          title={h.fileName}
                        >
                          {h.fileName}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                          <Clock size={12} />
                          {formatDate(h.createdAt)}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                          <Clock size={12} />
                          Time: {formatDuration(h.duration)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteHistory(h._id)}
                        className="btn btn-secondary btn-icon text-slate-400 hover:text-red-500"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="bg-green-50/50 p-2.5 rounded-lg border border-green-100">
                        <div className="text-[10px] uppercase tracking-wider font-bold text-green-700 opacity-70 mb-0.5">
                          Imported
                        </div>
                        <div className="text-lg font-bold text-green-600">
                          {h.totalImported}
                        </div>
                      </div>
                      <div
                        className={`${h.totalSkipped > 0 ? "bg-amber-50/50 border-amber-100" : "bg-gray-50 border-gray-100"} p-2.5 rounded-lg border`}
                      >
                        <div
                          className={`text-[10px] uppercase tracking-wider font-bold opacity-70 mb-0.5 ${h.totalSkipped > 0 ? "text-amber-700" : "text-gray-500"}`}
                        >
                          Skipped
                        </div>
                        <div
                          className={`text-lg font-bold ${h.totalSkipped > 0 ? "text-amber-600" : "text-gray-400"}`}
                        >
                          {h.totalSkipped}
                        </div>
                      </div>
                    </div>

                    {h.totalSkipped > 0 && (
                      <button
                        onClick={() => showSkipDetails(h)}
                        className="btn btn-secondary mt-3 w-full justify-center text-blue-700"
                      >
                        <Info size={16} />
                        View Skipped Details
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
