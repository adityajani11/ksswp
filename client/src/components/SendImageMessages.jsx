import { useRef, useState } from "react";
import Swal from "sweetalert2";
import api, { getApiErrorMessage } from "../utils/api";
import { Image } from "lucide-react";
import {
  showCampaignSummary,
  waitForCampaignCompletion,
} from "../utils/campaignProgress";
import useRecipientGroups from "../hooks/useRecipientGroups";
import RecipientSelectionModal from "./RecipientSelectionModal";

export default function SendImageMessages() {
  const [caption, setCaption] = useState("");
  const [imageFile, setImageFile] = useState(null);
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

    if (value.includes("\n") || value.includes("\r")) {
      value = value.replace(/[\r\n]+/g, " ");
      violated = true;
    }

    if (/\s{2,}/.test(value)) {
      value = value.replace(/\s{2,}/g, " ");
      violated = true;
    }

    if (value.length > 200) {
      value = value.slice(0, 200);
      violated = true;
    }

    if (violated) {
      Swal.fire({
        icon: "info",
        title: "Formatting not allowed",
        text: "WhatsApp allows single-line text with single spaces (max 200 chars).",
        timer: 1600,
        showConfirmButton: false,
      });
    }

    setCaption(value);
  };

  const handleCaptionKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
    }
    if (e.key === " " && caption.endsWith(" ")) {
      e.preventDefault();
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      Swal.fire("Invalid file", "Only JPG, PNG, WEBP allowed", "error");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      Swal.fire("Too large", "Max image size is 50MB", "error");
      return;
    }

    setImageFile(file);
  };

  const uploadImageToS3 = async () => {
    const res = await api.post("/upload/signed-url", {
      fileName: imageFile.name,
      contentType: imageFile.type,
      category: "image",
    });

    const { uploadUrl, publicUrl } = res.data;

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: imageFile,
    });

    if (!uploadRes.ok) {
      throw new Error(`S3 upload failed with status ${uploadRes.status}`);
    }

    return publicUrl;
  };

  const openGroupSelection = async () => {
    if (!caption.trim() || !imageFile) {
      Swal.fire("Required", "Image and caption are required", "warning");
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

  const sendImageMessages = async () => {
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
      html: `
        <p>
          Send image to <strong>${recipientsPayload.length}</strong> contact(s)
        </p>
      `,
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
      uploadedUrl = await uploadImageToS3();
    } catch (err) {
      console.error("UPLOAD ERROR:", err);
      Swal.fire({
        icon: "error",
        title: "Upload failed",
        text: "Image upload failed. Please try again.",
      });
      return;
    }

    try {
      const res = await api.post("/whatsapp/queue/campaign", {
        type: "image",
        text: caption,
        contacts: recipientsPayload,
        link: uploadedUrl,
        mediaMimeType: imageFile?.type,
        mediaFileName: imageFile?.name,
      });

      let finalCampaign = null;
      try {
        finalCampaign = await waitForCampaignCompletion({
          campaignId: res.data.campaignId,
          title: "Sending Image Messages...",
          label: "Image campaign",
        });
      } catch (trackErr) {
        console.error("Campaign progress tracking failed:", trackErr);
      }

      if (finalCampaign) {
        await showCampaignSummary(finalCampaign, "Image Campaign");
      } else {
        Swal.fire(
          "Queued",
          `Image campaign queued for ${res.data.totalRecipients} contact(s).\nID: ${res.data.campaignId}`,
          "info",
        );
      }
    } catch (err) {
      console.error("WHATSAPP QUEUE ERROR:", err);
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to queue image campaign"),
        "error",
      );
      return;
    }

    setCaption("");
    setImageFile(null);
    discardSelection();
    setShowGroupModal(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="app-page app-page-compact">
      <div className="page-header">
        <div>
          <h1 className="page-title">Send Image Message</h1>
        </div>

        <span className="chip chip-neutral">
          {imageFile ? imageFile.name : "No image selected"}
        </span>
      </div>

      <section className="app-card app-card-section space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
            <Image size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Image composer
            </h2>
            <p className="text-sm text-slate-500">
              Accepted formats: JPG, PNG, and WEBP up to 50 MB.
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
          accept=".jpg,.jpeg,.png,.webp"
          onChange={handleImageSelect}
        />

        <div className="flex justify-end mt-3">
          <button
            onClick={openGroupSelection}
            disabled={!caption || !imageFile}
            className="btn btn-primary"
          >
            Send Image
          </button>
        </div>
      </section>

      <RecipientSelectionModal
        open={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        onSubmit={sendImageMessages}
        submitLabel="Send Image"
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
