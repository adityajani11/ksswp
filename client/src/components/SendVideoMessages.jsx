import { useEffect, useState, useRef } from "react";
import Swal from "sweetalert2";
import api from "../utils/api";
import { Video, ChevronDown, ChevronRight, Search } from "lucide-react";

export default function SendVideoMessages() {
  /* ---------------- STATE ---------------- */
  const [caption, setCaption] = useState("");
  const [videoFile, setVideoFile] = useState(null);

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
        timer: 1600,
        showConfirmButton: false,
      });
    }

    setCaption(value);
  };

  const handleCaptionKeyDown = (e) => {
    if (e.key === "Enter") e.preventDefault();
    if (e.key === " " && caption.endsWith(" ")) e.preventDefault();
  };

  /* ---------------- VIDEO VALIDATION ---------------- */
  const handleVideoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ["video/mp4", "video/quicktime"];

    if (!allowedTypes.includes(file.type)) {
      Swal.fire("Invalid file", "Only MP4 or MOV allowed", "error");
      return;
    }

    if (file.size > 16 * 1024 * 1024) {
      Swal.fire("Too large", "Max video size is 16MB", "error");
      return;
    }

    setVideoFile(file);
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
  const uploadVideoToS3 = async () => {
    const res = await api.post("/upload/signed-url", {
      fileName: videoFile.name,
      contentType: videoFile.type,
      category: "video",
    });

    const { uploadUrl, publicUrl } = res.data;

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: videoFile,
    });

    if (!uploadRes.ok) {
      throw new Error(`S3 upload failed with status ${uploadRes.status}`);
    }

    return publicUrl;
  };

  /* ---------------- SEND FLOW ---------------- */
  const openGroupSelection = () => {
    if (!caption.trim() || !videoFile) {
      Swal.fire("Required", "Video and caption are required", "warning");
      return;
    }

    discardSelection();
    setSearch("");
    setShowGroupModal(true);
  };

  const sendVideoMessages = async () => {
    if (!selectedContacts.length) {
      Swal.fire("No contacts", "Select at least one contact", "warning");
      return;
    }

    const confirm = await Swal.fire({
      title: "Confirm Send?",
      html: `<p>Send video to <strong>${selectedContacts.length}</strong> contact(s)</p>`,
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

    let success = 0;
    let failed = 0;
    let uploadedUrl;

    try {
      uploadedUrl = await uploadVideoToS3();
    } catch (err) {
      console.error("UPLOAD ERROR:", err);
      Swal.fire("Error", "Video upload failed", "error");
      return;
    }

    for (const to of selectedContacts) {
      try {
        await api.post("/whatsapp/template/video", {
          to,
          link: uploadedUrl,
          text: caption,
        });
        success++;
      } catch {
        failed++;
      }
    }

    Swal.fire(
      "Completed",
      `Sent: ${success}\nFailed: ${failed}`,
      failed ? "warning" : "success",
    );

    setCaption("");
    setVideoFile(null);
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
          <Video size={18} />
          Video Message
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
          accept=".mp4,.mov"
          onChange={handleVideoSelect}
        />

        <div className="text-right">
          <button
            onClick={openGroupSelection}
            disabled={!caption || !videoFile}
            className="bg-purple-600 text-white px-5 py-2 rounded disabled:opacity-50"
          >
            Send Video
          </button>
        </div>
      </div>

      {/* GROUP MODAL */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl rounded-xl p-3 shadow-lg">
            {/* FULL MODAL CONTENT */}
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

            <div className="flex justify-end gap-2 mt-4">
              <button
                className="border px-4 py-2 rounded"
                onClick={() => setShowGroupModal(false)}
              >
                Cancel
              </button>

              <button
                onClick={sendVideoMessages}
                disabled={!selectedContacts.length}
                className="bg-purple-600 text-white px-4 py-2 rounded disabled:opacity-50"
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
