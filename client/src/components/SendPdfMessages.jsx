import { useRef, useState } from "react";
import Swal from "sweetalert2";
import api, { getApiErrorMessage } from "../utils/api";
import { FileText, ChevronDown, ChevronRight, Search } from "lucide-react";
import {
  showCampaignSummary,
  waitForCampaignCompletion,
} from "../utils/campaignProgress";
import useRecipientGroups from "../hooks/useRecipientGroups";

export default function SendPdfMessages() {
  const [caption, setCaption] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const {
    groups,
    batches,
    groupsLoading,
    batchesLoading,
    selectionLoading,
    selectedGroups,
    selectedBatches,
    selectedContacts,
    expandedGroups,
    search,
    setSearch,
    ensureSelectionOptionsLoaded,
    buildRecipientPayload,
    discardSelection,
    isGroupLoading,
    toggleContact,
    toggleGroup,
    toggleBatch,
    toggleGroupExpand,
    selectAll,
  } = useRecipientGroups();

  const fileInputRef = useRef(null);

  const handleCaptionChange = (e) => {
    let value = e.target.value;
    let violated = false;

    value = value.replace(/[\r\n]+/g, " ");
    value = value.replace(/\s{2,}/g, " ");

    if (value.length > 500) {
      value = value.slice(0, 500);
      violated = true;
    }

    if (violated) {
      Swal.fire({
        icon: "info",
        title: "Formatting not allowed",
        text: "Single-line text only (max 500 chars).",
        timer: 1500,
        showConfirmButton: false,
      });
    }

    setCaption(value);
  };

  const handleCaptionKeyDown = (e) => {
    if (e.key === "Enter") e.preventDefault();
    if (e.key === " " && caption.endsWith(" ")) e.preventDefault();
  };

  const handlePdfSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      Swal.fire("Invalid file", "Only PDF files are allowed", "error");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      Swal.fire("Too large", "Max PDF size is 100MB", "error");
      return;
    }

    setPdfFile(file);
  };

  const uploadPdfToS3 = async () => {
    const res = await api.post("/upload/signed-url", {
      fileName: pdfFile.name,
      contentType: pdfFile.type,
      category: "document",
    });

    const { uploadUrl, publicUrl } = res.data;

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: pdfFile,
    });

    if (!uploadRes.ok) {
      throw new Error(`S3 upload failed (${uploadRes.status})`);
    }

    return publicUrl;
  };

  const openGroupSelection = async () => {
    if (!caption.trim() || !pdfFile) {
      Swal.fire("Required", "PDF and message are required", "warning");
      return;
    }

    discardSelection();
    setSearch("");
    setShowGroupModal(true);

    const nextGroups = await ensureSelectionOptionsLoaded();
    if (!nextGroups) {
      setShowGroupModal(false);
    }
  };

  const sendPdfMessages = async () => {
    if (!selectedContacts.length) {
      Swal.fire("No contacts", "Select at least one contact", "warning");
      return;
    }

    const recipientsPayload = await buildRecipientPayload();
    if (!recipientsPayload?.length) {
      return;
    }

    const confirm = await Swal.fire({
      title: "Confirm Send?",
      html: `<p>Send PDF to <strong>${recipientsPayload.length}</strong> contact(s)</p>`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Send",
    });

    if (!confirm.isConfirmed) return;

    Swal.fire({
      title: "Uploading & Sending...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    let uploadedUrl;

    try {
      uploadedUrl = await uploadPdfToS3();
    } catch (err) {
      console.error("UPLOAD ERROR:", err);
      Swal.fire("Error", "PDF upload failed", "error");
      return;
    }

    try {
      const res = await api.post("/whatsapp/queue/campaign", {
        type: "document",
        text: caption,
        contacts: recipientsPayload,
        link: uploadedUrl,
        mediaMimeType: pdfFile?.type,
        mediaFileName: pdfFile?.name,
      });

      let finalCampaign = null;
      try {
        finalCampaign = await waitForCampaignCompletion({
          campaignId: res.data.campaignId,
          title: "Sending PDF Messages...",
          label: "PDF campaign",
        });
      } catch (trackErr) {
        console.error("Campaign progress tracking failed:", trackErr);
      }

      if (finalCampaign) {
        await showCampaignSummary(finalCampaign, "PDF Campaign");
      } else {
        Swal.fire({
          title: "Queued",
          html: `
            <div style="text-align:center">
              <p style="margin-bottom:8px;">
                PDF campaign queued for ${res.data.totalRecipients} contact(s).
              </p>
              <p style="font-size:12px;color:#666">
                Campaign ID: ${res.data.campaignId}
              </p>
            </div>
          `,
          icon: "info",
        });
      }
    } catch (err) {
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to queue PDF campaign"),
        "error",
      );
      return;
    }

    setCaption("");
    setPdfFile(null);
    discardSelection();
    setShowGroupModal(false);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 font-medium text-gray-700">
          <FileText size={18} />
          PDF Message
        </div>

        <textarea
          value={caption}
          onChange={handleCaptionChange}
          onKeyDown={handleCaptionKeyDown}
          rows={3}
          maxLength={500}
          placeholder="Message (max 500 chars)"
          className="w-full border rounded-lg p-3 resize-none"
        />

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handlePdfSelect}
        />

        <div className="text-right">
          <button
            onClick={openGroupSelection}
            disabled={!caption || !pdfFile}
            className="bg-indigo-600 text-white px-5 py-2 rounded disabled:opacity-50"
          >
            Send PDF
          </button>
        </div>
      </div>

      {showGroupModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl rounded-xl p-3 shadow-lg">
            <h3 className="text-lg font-semibold mb-3 flex justify-between">
              Select Recipients
              <span className="text-sm text-gray-500">
                {selectedContacts.length} selected
              </span>
            </h3>

            <div className="flex items-center gap-2 mb-3 border rounded px-3 py-2">
              <Search size={16} className="text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search group name..."
                className="w-full outline-none"
              />
            </div>

            <div className="flex gap-2 mb-3">
              <button
                onClick={selectAll}
                disabled={selectionLoading || groupsLoading}
                className="text-sm px-3 py-1 bg-gray-100 rounded disabled:opacity-50"
              >
                {selectionLoading ? "Selecting..." : "Select All"}
              </button>
              <button
                onClick={discardSelection}
                className="text-sm px-3 py-1 bg-red-100 text-red-600 rounded"
              >
                Discard
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto border rounded p-3 space-y-3">
              {groupsLoading ? (
                <p className="text-sm text-gray-500">
                  Loading groups...
                </p>
              ) : groups.length === 0 ? (
                <p className="text-sm text-gray-500">No groups found.</p>
              ) : (
                groups.map((group) => (
                  <div key={group._id} className="border rounded">
                    <div className="flex items-center gap-2 p-2 bg-gray-50">
                      <button
                        onClick={() => toggleGroupExpand(group._id)}
                        disabled={isGroupLoading(group._id)}
                      >
                        {expandedGroups.includes(group._id) ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </button>

                      <input
                        type="checkbox"
                        checked={selectedGroups.includes(group._id)}
                        onChange={() => toggleGroup(group)}
                        disabled={isGroupLoading(group._id)}
                      />

                      <span className="font-medium">
                        {group.name}
                        <span className="text-xs text-gray-500 ml-1">
                          ({group.contactCount || 0})
                        </span>
                      </span>
                    </div>

                    {expandedGroups.includes(group._id) && (
                      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {isGroupLoading(group._id) ? (
                          <p className="text-sm text-gray-500">Loading contacts...</p>
                        ) : (group.contacts || []).length === 0 ? (
                          <p className="text-sm text-gray-500">No contacts in this group.</p>
                        ) : (
                          group.contacts.map((contact) => (
                            <label
                              key={contact.phone}
                              className="flex items-center gap-2"
                            >
                              <input
                                type="checkbox"
                                checked={selectedContacts.includes(contact.phone)}
                                onChange={() => toggleContact(contact.phone)}
                              />
                              <span className="text-sm">
                                {contact.name}
                                <span className="text-xs text-gray-500 ml-1">
                                  (+{contact.phone})
                                </span>
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="mt-3 border rounded p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Batches
              </p>

              {batchesLoading ? (
                <p className="text-sm text-gray-500">Loading batches...</p>
              ) : batches.length === 0 ? (
                <p className="text-sm text-gray-500">No batches found.</p>
              ) : (
                <div className="space-y-2">
                  {batches.map((batch) => (
                    <label
                      key={batch._id}
                      className="flex items-start gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedBatches.includes(batch._id)}
                        onChange={() => toggleBatch(batch)}
                        disabled={selectionLoading}
                      />
                      <span>
                        {batch.name}
                        <span className="text-xs text-gray-500 ml-1">
                          ({batch.groupCount || batch.groupIds?.length || 0} groups, {batch.contactCount || 0} contacts)
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                className="border px-4 py-2 rounded"
                onClick={() => setShowGroupModal(false)}
              >
                Cancel
              </button>

              <button
                onClick={sendPdfMessages}
                disabled={!selectedContacts.length}
                className="bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

