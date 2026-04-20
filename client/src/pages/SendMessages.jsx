import { useState } from "react";
import Swal from "sweetalert2";
import api, { getApiErrorMessage } from "../utils/api";
import { Send } from "lucide-react";
import {
  showCampaignSummary,
  waitForCampaignCompletion,
} from "../utils/campaignProgress";
import useRecipientGroups from "../hooks/useRecipientGroups";
import RecipientSelectionModal from "../components/RecipientSelectionModal";

export default function SendGroupMessages() {
  const [text, setText] = useState("");
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
    selectedIndividualDetails,
    expandedGroups,
    search,
    setSearch,
    mobileSearch,
    setMobileSearch,
    mobileSearchLoading,
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
        toast: true,
        position: "top-end",
      });
    }

    setText(value);
  };

  const sendMessages = async () => {
    if (!text.trim()) {
      Swal.fire("Error", "Please enter a message", "error");
      return;
    }

    const recipients = await buildRecipientPayload();
    if (!recipients || !recipients.length) {
      Swal.fire("Error", "Please select recipients", "error");
      return;
    }

    try {
      const response = await api.post("/whatsapp/queue/campaign", {
        type: "text",
        text: text.trim(),
        contacts: recipients,
      });

      setShowGroupModal(false);
      
      const campaignId = response.data.campaignId;
      const finalCampaign = await waitForCampaignCompletion({
        campaignId,
        title: "Sending Messages...",
        label: "Text campaign",
      });

      if (finalCampaign) {
        await showCampaignSummary(finalCampaign, "Text Campaign");
      }
      
      setText("");
      discardSelection();
    } catch (err) {
      Swal.fire("Error", getApiErrorMessage(err, "Failed to start campaign"), "error");
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-emerald-500 p-2.5 rounded-2xl shadow-lg shadow-emerald-200">
          <Send className="text-white" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Send Messages</h1>
          <p className="text-slate-500">Compose and broadcast to your contacts</p>
        </div>
      </div>

      <section className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
        <div className="p-6 border-bottom border-slate-100 bg-slate-50/50">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Message Compose
          </label>
          <textarea
            value={text}
            onChange={handleTextChange}
            placeholder="Type your WhatsApp message here..."
            className="w-full h-40 p-4 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-50/50 focus:border-emerald-500 transition-all resize-none text-slate-700 placeholder:text-slate-400"
          />
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>Only single line and single spaces are allowed.</span>
            <span>{text.length} characters</span>
          </div>
        </div>

        <div className="p-6 bg-slate-50/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              <div className="w-8 h-8 rounded-full bg-emerald-100 border-2 border-white flex items-center justify-center text-emerald-600 font-bold text-xs">A</div>
              <div className="w-8 h-8 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-blue-600 font-bold text-xs">B</div>
              <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-slate-400 font-bold text-xs">+</div>
            </div>
            <span className="text-sm font-medium text-slate-600">
              {selectedContacts.length} recipients selected
            </span>
          </div>
          <button
            onClick={() => {
              ensureSelectionOptionsLoaded();
              setShowGroupModal(true);
            }}
            className="btn btn-primary px-6 py-2.5 rounded-xl flex items-center gap-2"
          >
            Select Recipients
          </button>
        </div>
      </section>

      <RecipientSelectionModal
        open={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        onSubmit={sendMessages}
        submitLabel="Send Text"
        groups={groups}
        batches={batches}
        groupsLoading={groupsLoading}
        batchesLoading={batchesLoading}
        mobileSearchLoading={mobileSearchLoading}
        mobileSearchMatches={mobileSearchMatches}
        selectionLoading={selectionLoading}
        selectedGroups={selectedGroups}
        selectedBatches={selectedBatches}
        selectedContacts={selectedContacts}
        selectedIndividualDetails={selectedIndividualDetails}
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
