import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import api, { getApiErrorMessage } from "../utils/api";
import { Send, ChevronDown, ChevronRight, Search } from "lucide-react";
import {
  showCampaignSummary,
  waitForCampaignCompletion,
} from "../utils/campaignProgress";

export default function SendGroupMessages() {
  /* ---------------- STATE ---------------- */
  const [text, setText] = useState("");
  const [groups, setGroups] = useState([]);

  const [showGroupModal, setShowGroupModal] = useState(false);

  const [selectedGroups, setSelectedGroups] = useState([]); // groupIds
  const [selectedContacts, setSelectedContacts] = useState([]); // phone numbers
  const [manuallyDeselected, setManuallyDeselected] = useState([]); // phones

  const [expandedGroups, setExpandedGroups] = useState([]); // groupIds
  const [search, setSearch] = useState("");

  /* ---------------- FETCH GROUPS ---------------- */
  useEffect(() => {
    api.get("/groups").then((res) => {
      setGroups(Array.isArray(res.data) ? res.data : []);
    });
  }, []);

  /* ---------------- TEXT VALIDATION ---------------- */
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

  /* ---------------- SELECTION HELPERS ---------------- */
  const toggleGroupExpand = (groupId) => {
    setExpandedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  };

  const toggleGroup = (group) => {
    setSelectedGroups((prevGroups) => {
      const isSelected = prevGroups.includes(group._id);
      const nextGroups = isSelected
        ? prevGroups.filter((id) => id !== group._id)
        : [...prevGroups, group._id];

      setSelectedContacts(() => {
        const phoneSet = new Set();

        nextGroups.forEach((groupId) => {
          const g = groups.find((gr) => gr._id === groupId);
          g?.contacts?.forEach((c) => {
            if (!manuallyDeselected.includes(c.phone)) {
              phoneSet.add(c.phone);
            }
          });
        });

        return [...phoneSet];
      });

      return nextGroups;
    });
  };

  const toggleContact = (phone) => {
    setSelectedContacts((prev) => {
      const isSelected = prev.includes(phone);

      setManuallyDeselected((md) =>
        isSelected ? [...md, phone] : md.filter((p) => p !== phone),
      );

      return isSelected ? prev.filter((p) => p !== phone) : [...prev, phone];
    });
  };

  const selectAll = () => {
    const allGroups = groups.map((g) => g._id);
    const allPhones = groups.flatMap(
      (g) => g.contacts?.map((c) => c.phone) || [],
    );

    setSelectedGroups(allGroups);
    setSelectedContacts([...new Set(allPhones)]);
    setExpandedGroups(allGroups); // expand all for visibility
  };

  const discardSelection = () => {
    setSelectedGroups([]);
    setSelectedContacts([]);
    setManuallyDeselected([]);
    setExpandedGroups([]);
  };

  /* ---------------- SEND FLOW ---------------- */
  const openGroupSelection = () => {
    if (!text.trim()) {
      Swal.fire("Required", "Message text is required", "warning");
      return;
    }

    discardSelection();
    setSearch("");
    setShowGroupModal(true);
  };

  const sendMessages = async () => {
    if (!selectedContacts.length) {
      Swal.fire("No contacts", "Please select at least one contact", "warning");
      return;
    }

    const phoneToName = new Map();
    for (const group of groups) {
      for (const contact of group.contacts || []) {
        if (!phoneToName.has(contact.phone)) {
          phoneToName.set(contact.phone, contact.name || "");
        }
      }
    }

    const recipientsPayload = [...new Set(selectedContacts)].map((phone) => {
      const name = phoneToName.get(phone) || "";
      return name ? { to: phone, name } : { to: phone };
    });

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

  /* ---------------- FILTERED DATA ---------------- */
  const filteredGroups = groups.filter((g) => {
    const q = search.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      g.contacts?.some(
        (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q),
      )
    );
  });

  /* ---------------- UI ---------------- */
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* TEXT MESSAGE */}
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

      {/* GROUP + CONTACT MODAL */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl rounded-xl p-3 shadow-lg">
            <h3 className="text-lg font-semibold mb-3 flex justify-between">
              Select Recipients
              <span className="text-sm text-gray-500">
                {selectedContacts.length} selected
              </span>
            </h3>

            {/* SEARCH */}
            <div className="flex items-center gap-2 mb-3 border rounded px-3 py-2">
              <Search size={16} className="text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search group or contact..."
                className="w-full outline-none"
              />
            </div>

            {/* ACTIONS */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={selectAll}
                className="text-sm px-3 py-1 bg-gray-100 rounded"
              >
                Select All
              </button>

              <button
                onClick={discardSelection}
                className="text-sm px-3 py-1 bg-red-100 text-red-600 rounded"
              >
                Discard
              </button>
            </div>

            {/* GROUP LIST */}
            <div className="max-h-72 overflow-y-auto border rounded p-3 space-y-3">
              {filteredGroups.map((g) => (
                <div key={g._id} className="border rounded">
                  {/* GROUP HEADER */}
                  <div className="flex items-center gap-2 p-2 bg-gray-50">
                    <button
                      onClick={() => toggleGroupExpand(g._id)}
                      className="text-gray-500"
                    >
                      {expandedGroups.includes(g._id) ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </button>

                    <input
                      type="checkbox"
                      checked={selectedGroups.includes(g._id)}
                      onChange={() => toggleGroup(g)}
                    />

                    <span className="font-medium">
                      {g.name}
                      <span className="text-xs text-gray-500 ml-1">
                        ({g.contacts?.length || 0})
                      </span>
                    </span>
                  </div>

                  {/* CONTACTS */}
                  {expandedGroups.includes(g._id) && (
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {g.contacts?.map((c) => (
                        <label
                          key={c.phone}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="me-2"
                            checked={selectedContacts.includes(c.phone)}
                            onChange={() => toggleContact(c.phone)}
                          />
                          <span>
                            {c.name}
                            <span className="text-xs text-gray-500 ml-1">
                              (+{c.phone})
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* FOOTER */}
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
