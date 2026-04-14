import { useRef, useState } from "react";
import Swal from "sweetalert2";
import api, { getApiErrorMessage } from "../utils/api";
import { Image, ChevronDown, ChevronRight, Search } from "lucide-react";
import {
  showCampaignSummary,
  waitForCampaignCompletion,
} from "../utils/campaignProgress";
import useRecipientGroups from "../hooks/useRecipientGroups";

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
    filterContactsByMobile,
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
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 font-medium text-gray-700">
          <Image size={18} />
          Image Message
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
          accept=".jpg,.jpeg,.png,.webp"
          onChange={handleImageSelect}
        />

        <div className="text-right">
          <button
            onClick={openGroupSelection}
            disabled={!caption || !imageFile}
            className="bg-green-600 text-white px-5 py-2 rounded disabled:opacity-50"
          >
            Send Image
          </button>
        </div>
      </div>

      {showGroupModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 sm:p-4">
          <div className="flex min-h-full items-center justify-center">
            <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white p-3 shadow-lg">
              <h3 className="mb-3 flex flex-wrap justify-between gap-2 text-lg font-semibold">
              Select Recipients
              <span className="text-sm text-gray-500">
                {selectedContacts.length} selected
              </span>
              </h3>

              <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto pr-1">

            <div className="flex items-center gap-2 mb-3 border rounded px-3 py-2">
              <Search size={16} className="text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search group name..."
                className="w-full outline-none"
              />
            </div>

            <div className="flex items-center gap-2 mb-3 border rounded px-3 py-2">
              <Search size={16} className="text-gray-400" />
              <input
                value={mobileSearch}
                onChange={(e) => setMobileSearch(e.target.value)}
                placeholder="Search by mobile number..."
                className="w-full outline-none"
              />
            </div>

            {String(mobileSearch || "").trim() && (
              <div className="mb-3 border rounded p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Matching Numbers
                </p>
                {mobileSearchMatches.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No matching mobile numbers found.
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {mobileSearchMatches.map((contact) => (
                      <label
                        key={contact.phone}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedContacts.includes(contact.phone)}
                          onChange={() => toggleContact(contact.phone)}
                        />
                        <span>
                          {contact.name || "Unnamed"}
                          <span className="text-xs text-gray-500 ml-1">
                            (+{contact.phone})
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

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
                        {(() => {
                          const filteredContacts = filterContactsByMobile(group.contacts || []);
                          if (isGroupLoading(group._id)) {
                            return <p className="text-sm text-gray-500">Loading contacts...</p>;
                          }
                          if ((group.contacts || []).length === 0) {
                            return <p className="text-sm text-gray-500">No contacts in this group.</p>;
                          }
                          if (filteredContacts.length === 0) {
                            return (
                              <p className="text-sm text-gray-500">
                                No contacts match this mobile number.
                              </p>
                            );
                          }
                          return filteredContacts.map((contact) => (
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
                          ));
                        })()}
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

              </div>

              <div className="mt-4 flex justify-end gap-2 border-t pt-3">
              <button
                className="border px-4 py-2 rounded"
                onClick={() => setShowGroupModal(false)}
              >
                Cancel
              </button>
              <button
                onClick={sendImageMessages}
                disabled={!selectedContacts.length}
                className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                Send
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

