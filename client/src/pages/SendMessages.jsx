import { useState } from "react";
import Swal from "sweetalert2";
import api, { getApiErrorMessage } from "../utils/api";
import { Send, ChevronDown, ChevronRight, Search } from "lucide-react";
import {
  showCampaignSummary,
  waitForCampaignCompletion,
} from "../utils/campaignProgress";
import useRecipientGroups from "../hooks/useRecipientGroups";

export default function SendGroupMessages() {
  const [text, setText] = useState("");
  const [showGroupModal, setShowGroupModal] = useState(false);
  const {
    groups,
    batches,
    groupsLoading,
    batchesLoading,
    searchLoading,
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

  const handleTextChange = (e) => {
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

    if (violated) {
      Swal.fire({
        icon: "info",
        title: "Formatting not allowed",
        text: "WhatsApp allows only single-line messages with single spaces.",
        timer: 1600,
        showConfirmButton: false,
      });
    }

    setText(value);
  };

  const handleTextKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      Swal.fire({
        icon: "info",
        title: "Single line only",
        text: "New lines are not allowed in WhatsApp messages.",
        timer: 1600,
        showConfirmButton: false,
      });
    }

    if (e.key === " " && text.endsWith(" ")) {
      e.preventDefault();
    }
  };

  const openGroupSelection = async () => {
    if (!text.trim()) {
      Swal.fire("Required", "Message text is required", "warning");
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

  const sendMessages = async () => {
    if (!selectedContacts.length) {
      Swal.fire("No contacts", "Please select at least one contact", "warning");
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
          Send message to
          <strong> ${selectedGroups.length} group(s)</strong><br/>
          <strong>${recipientsPayload.length} contact(s)</strong>
        </p>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Send",
    });

    if (!confirm.isConfirmed) return;

    Swal.fire({
      title: "Queueing...",
      text: "Preparing campaign",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const res = await api.post("/whatsapp/queue/campaign", {
        type: "text",
        text,
        contacts: recipientsPayload,
      });

      let finalCampaign = null;
      try {
        finalCampaign = await waitForCampaignCompletion({
          campaignId: res.data.campaignId,
          title: "Sending Text Messages...",
          label: "Text campaign",
        });
      } catch (trackErr) {
        console.error("Campaign progress tracking failed:", trackErr);
      }

      if (finalCampaign) {
        await showCampaignSummary(finalCampaign, "Text Campaign");
      } else {
        Swal.fire(
          "Queued",
          `Campaign queued for ${res.data.totalRecipients} contact(s).\nID: ${res.data.campaignId}`,
          "info",
        );
      }
    } catch (err) {
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to queue text campaign"),
        "error",
      );
      return;
    }

    setText("");
    discardSelection();
    setShowGroupModal(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white border rounded-xl p-3 space-y-3 shadow-sm">
        <div className="flex items-center gap-2 font-medium text-gray-700">
          <Send size={18} />
          Text Message
        </div>

        <textarea
          className="w-full p-3 border rounded-lg resize-none"
          rows={4}
          placeholder="Type your WhatsApp message..."
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleTextKeyDown}
          maxLength={700}
        />

        <div className="text-right">
          <button
            onClick={openGroupSelection}
            disabled={!text}
            className="bg-blue-600 text-white px-5 py-2 rounded disabled:opacity-50"
          >
            Send Text
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
                placeholder="Search group or contact..."
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
              {groupsLoading || searchLoading ? (
                <p className="text-sm text-gray-500">
                  {searchLoading ? "Searching groups..." : "Loading groups..."}
                </p>
              ) : groups.length === 0 ? (
                <p className="text-sm text-gray-500">No groups found.</p>
              ) : (
                groups.map((group) => (
                  <div key={group._id} className="border rounded">
                    <div className="flex items-center gap-2 p-2 bg-gray-50">
                      <button
                        onClick={() => toggleGroupExpand(group._id)}
                        className="text-gray-500 disabled:opacity-50"
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
                          <p className="text-sm text-gray-500">
                            Loading contacts...
                          </p>
                        ) : (group.contacts || []).length === 0 ? (
                          <p className="text-sm text-gray-500">
                            No contacts in this group.
                          </p>
                        ) : (
                          group.contacts.map((contact) => (
                            <label
                              key={contact.phone}
                              className="flex items-center gap-2 text-sm"
                            >
                              <input
                                type="checkbox"
                                className="me-2"
                                checked={selectedContacts.includes(
                                  contact.phone,
                                )}
                                onChange={() => toggleContact(contact.phone)}
                              />
                              <span>
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
                        className="me-2"
                      />
                      <span>
                        {batch.name}
                        <span className="text-xs text-gray-500 ml-1">
                          ({batch.groupCount || batch.groupIds?.length || 0}{" "}
                          groups, {batch.contactCount || 0} contacts)
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
                disabled={!selectedContacts.length}
                onClick={sendMessages}
                className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
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
