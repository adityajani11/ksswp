import { useEffect, useState, useRef } from "react";
import Swal from "sweetalert2";
import api, { getApiErrorMessage } from "../utils/api";
import { FileText, ChevronDown, ChevronRight, Search } from "lucide-react";
import {
  showCampaignSummary,
  waitForCampaignCompletion,
} from "../utils/campaignProgress";

export default function SendPdfMessages() {
  /* ---------------- STATE ---------------- */
  const [caption, setCaption] = useState("");
  const [pdfFile, setPdfFile] = useState(null);

  const [groups, setGroups] = useState([]);
  const [showGroupModal, setShowGroupModal] = useState(false);

  const [selectedGroups, setSelectedGroups] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [manuallyDeselected, setManuallyDeselected] = useState([]);

  const [expandedGroups, setExpandedGroups] = useState([]);
  const [search, setSearch] = useState("");

  const fileInputRef = useRef(null);

  /* ---------------- FETCH GROUPS ---------------- */
  useEffect(() => {
    api.get("/groups").then((res) => {
      setGroups(Array.isArray(res.data) ? res.data : []);
    });
  }, []);

  /* ---------------- CAPTION VALIDATION ---------------- */
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

  /* ---------------- PDF VALIDATION ---------------- */
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

  /* ---------------- GROUP SELECTION ---------------- */
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
    setExpandedGroups(allGroups);
  };

  const discardSelection = () => {
    setSelectedGroups([]);
    setSelectedContacts([]);
    setManuallyDeselected([]);
    setExpandedGroups([]);
  };

  /* ---------------- UPLOAD TO S3 ---------------- */
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

  /* ---------------- SEND FLOW ---------------- */
  const openGroupSelection = () => {
    if (!caption.trim() || !pdfFile) {
      Swal.fire("Required", "PDF and message are required", "warning");
      return;
    }

    discardSelection();
    setSearch("");
    setShowGroupModal(true);
  };

  const sendPdfMessages = async () => {
    if (!selectedContacts.length) {
      Swal.fire("No contacts", "Select at least one contact", "warning");
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

  /* ---------------- FILTER ---------------- */
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

      {/* GROUP MODAL – identical to Image/Video, sendPdfMessages */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl rounded-xl p-3 shadow-lg">
            <h3 className="text-lg font-semibold mb-3 flex justify-between">
              Select Recipients
              <span className="text-sm text-gray-500">
                {[...new Set(selectedContacts)].length} selected
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
                  <div className="flex items-center gap-2 p-2 bg-gray-50">
                    <button onClick={() => toggleGroupExpand(g._id)}>
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

                  {expandedGroups.includes(g._id) && (
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {g.contacts?.map((c) => (
                        <label
                          key={c.phone}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="checkbox"
                            checked={selectedContacts.includes(c.phone)}
                            onChange={() => toggleContact(c.phone)}
                          />
                          <span className="text-sm">
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
