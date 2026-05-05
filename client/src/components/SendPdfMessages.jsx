import { useRef, useState } from "react";
import Swal from "sweetalert2";
import api, { getApiErrorMessage } from "../utils/api";
import { FileText } from "lucide-react";
import {
  showCampaignSummary,
  waitForCampaignCompletion,
} from "../utils/campaignProgress";
import useRecipientGroups from "../hooks/useRecipientGroups";
import RecipientSelectionModal from "./RecipientSelectionModal";

export default function SendPdfMessages() {
  const [caption, setCaption] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const {
    groups,
    batches,
    groupsLoading,
    batchesLoading,
    mobileSearchMatches,
    selectionLoading,
    selectedGroups,
    selectedBatches,
    selectedContacts,
    expandedGroups,
    search,
    setSearch,
    mobileSearch,
    setMobileSearch,
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
    setMobileSearch("");
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
    <div className="app-page app-page-compact">
      <div className="page-header">
        <div>
          <h1 className="page-title">Send PDF Message</h1>
        </div>

        <span className="chip chip-neutral">
          {pdfFile ? pdfFile.name : "No PDF selected"}
        </span>
      </div>

      <section className="app-card app-card-section space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-amber-50 p-3 text-amber-700">
            <FileText size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Document composer
            </h2>
            <p className="text-sm text-slate-500">
              Upload one PDF up to 100 MB and add a short message for
              recipients.
            </p>
          </div>
        </div>

        <textarea
          value={caption}
          onChange={handleCaptionChange}
          onKeyDown={handleCaptionKeyDown}
          rows={3}
          maxLength={500}
          placeholder="Message (max 500 chars)"
          className="app-textarea min-h-[10rem]"
        />

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handlePdfSelect}
        />

        <div className="flex justify-end mt-3">
          <button
            onClick={openGroupSelection}
            disabled={!caption || !pdfFile}
            className="btn btn-primary"
          >
            Send PDF
          </button>
        </div>
      </section>

      <RecipientSelectionModal
        open={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        onSubmit={sendPdfMessages}
        submitLabel="Send PDF"
        groups={groups}
        batches={batches}
        groupsLoading={groupsLoading}
        batchesLoading={batchesLoading}
        mobileSearchMatches={mobileSearchMatches}
        selectionLoading={selectionLoading}
        selectedGroups={selectedGroups}
        selectedBatches={selectedBatches}
        selectedContacts={selectedContacts}
        expandedGroups={expandedGroups}
        search={search}
        setSearch={setSearch}
        mobileSearch={mobileSearch}
        setMobileSearch={setMobileSearch}
        discardSelection={discardSelection}
        isGroupLoading={isGroupLoading}
        toggleContact={toggleContact}
        toggleGroup={toggleGroup}
        toggleBatch={toggleBatch}
        toggleGroupExpand={toggleGroupExpand}
        selectAll={selectAll}
      />
    </div>
  );
}
