import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import api from "../utils/api";
import { Send, Image, FileText } from "lucide-react";

export default function SendMessages() {
  const [text, setText] = useState("");
  const [media, setMedia] = useState(null);
  const [doc, setDoc] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [showContactModal, setShowContactModal] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [pendingType, setPendingType] = useState(null);
  const [modalSearch, setModalSearch] = useState("");

  useEffect(() => {
    api.get("/contacts").then((res) => setContacts(res.data));
  }, []);

  const confirmSend = async (type) => {
    setPendingType(type);

    const choice = await Swal.fire({
      title: "Send Message",
      text: "Choose recipients",
      icon: "question",
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: "Send to All",
      denyButtonText: "Send to Specific",
    });

    if (choice.isConfirmed) {
      sendToContacts(
        contacts.map((c) => c.phone),
        type
      );
    }

    if (choice.isDenied) {
      setSelectedContacts([]);
      setShowContactModal(true);
    }
  };

  const sendToContacts = async (numbers, type) => {
    if (!numbers.length) {
      Swal.fire("No contacts selected", "", "warning");
      return;
    }

    const ok = await Swal.fire({
      title: "Confirm Send?",
      text: `Send message to ${numbers.length} contacts?`,
      icon: "warning",
      showCancelButton: true,
    });

    if (!ok.isConfirmed) return;

    try {
      for (const to of numbers) {
        if (type === "text") {
          await api.post("/whatsapp/template/text", { to, text });
        }

        if (type === "media") {
          const form = new FormData();
          form.append("to", to);
          form.append("file", media);
          await api.post("/whatsapp/template/image", form);
        }

        if (type === "doc") {
          const form = new FormData();
          form.append("to", to);
          form.append("file", doc);
          await api.post("/whatsapp/template/document", form);
        }
      }

      Swal.fire("Sent!", "Messages sent successfully", "success");
      // CLEAR INPUTS AFTER SUCCESS
      if (type === "text") {
        setText("");
      }

      if (type === "media") {
        setMedia(null);
      }

      if (type === "doc") {
        setDoc(null);
      }

      // Optional: clear selections
      setSelectedContacts([]);
      setModalSearch("");
    } catch (err) {
      Swal.fire("Error", "Failed to send messages", "error");
    }
  };

  const filteredModalContacts = contacts.filter((c) => {
    const q = modalSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)
    );
  });

  const handleTextChange = (e) => {
    let value = e.target.value;

    let violated = false;

    // Remove new lines
    if (value.includes("\n") || value.includes("\r")) {
      value = value.replace(/[\r\n]+/g, " ");
      violated = true;
    }

    // Replace multiple spaces with single space
    if (/\s{2,}/.test(value)) {
      value = value.replace(/\s{2,}/g, " ");
      violated = true;
    }

    if (violated) {
      Swal.fire({
        icon: "info",
        title: "Formatting not allowed",
        text: "New lines or multiple spaces are not allowed in WhatsApp messages.",
        timer: 1800,
        showConfirmButton: false,
      });
    }

    setText(value);
  };

  const handleTextKeyDown = (e) => {
    // Block Enter key
    if (e.key === "Enter") {
      e.preventDefault();

      Swal.fire({
        icon: "info",
        title: "Single-line message only",
        text: "WhatsApp does not allow new lines. Please write the message in a single line.",
        timer: 2000,
        showConfirmButton: false,
      });
    }

    // Block consecutive spaces via keyboard
    if (e.key === " " && text.endsWith(" ")) {
      e.preventDefault();

      Swal.fire({
        icon: "info",
        title: "Extra spaces not allowed",
        text: "Multiple consecutive spaces are not allowed.",
        timer: 1500,
        showConfirmButton: false,
      });
    }
  };

  return (
    <div className="max-w-6xl space-y-6 mx-auto">
      {/* TEXT MESSAGE */}
      <div className="bg-white border rounded-xl p-5 space-y-3 shadow-sm">
        <div className="flex items-center gap-2 text-gray-700 font-medium">
          <Send size={18} />
          Text Message
        </div>

        <textarea
          className="w-full p-3 border rounded-lg resize-none focus:ring focus:outline-none"
          rows={4}
          placeholder="Type your message here..."
          value={text}
          onKeyDown={handleTextKeyDown}
          onChange={handleTextChange}
          maxLength={700}
        />

        <div className="text-right">
          <button
            disabled={!text}
            onClick={() => confirmSend("text")}
            className="btn disabled:opacity-50 cursor-pointer"
          >
            Send Text
          </button>
        </div>
      </div>

      {/* MEDIA MESSAGE */}
      {/* <div className="bg-white border rounded-xl p-5 space-y-3 shadow-sm">
        <div className="flex items-center gap-2 text-gray-700 font-medium">
          <Image size={18} />
          Photo / Video
        </div>

        <input
          type="file"
          accept="image/*,video/*"
          onChange={(e) => setMedia(e.target.files[0])}
          className="block w-full text-sm"
        />

        <div className="text-right">
          <button
            disabled={!media}
            onClick={() => confirmSend("media")}
            className="btn disabled:opacity-50 cursor-pointer"
          >
            Send Media
          </button>
        </div>
      </div> */}

      {/* DOCUMENT MESSAGE */}
      {/* <div className="bg-white border rounded-xl p-5 space-y-3 shadow-sm">
        <div className="flex items-center gap-2 text-gray-700 font-medium">
          <FileText size={18} />
          Document
        </div>

        <input
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={(e) => setDoc(e.target.files[0])}
          className="block w-full text-sm"
        />

        <div className="text-right">
          <button
            disabled={!doc}
            onClick={() => confirmSend("doc")}
            className="btn disabled:opacity-50 cursor-pointer"
          >
            Send Document
          </button>
        </div>
      </div> */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-lg rounded-xl p-5 shadow-lg">
            <h3 className="text-lg font-semibold mb-3 flex justify-between">
              Select Contacts
              {selectedContacts.length > 0 && (
                <span className="px-2 py-2 text-xs rounded-full bg-blue-100 text-blue-700 font-medium">
                  {selectedContacts.length} selected
                </span>
              )}
            </h3>

            <input
              type="text"
              placeholder="Search contacts..."
              value={modalSearch}
              onChange={(e) => setModalSearch(e.target.value)}
              className="w-full mb-3 p-2.5 border rounded-lg focus:outline-none focus:ring focus:ring-blue-500"
            />

            {/* Select All */}
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                checked={
                  filteredModalContacts.length > 0 &&
                  filteredModalContacts.every((c) =>
                    selectedContacts.includes(c.phone)
                  )
                }
                onChange={(e) =>
                  setSelectedContacts(
                    e.target.checked
                      ? filteredModalContacts.map((c) => c.phone)
                      : selectedContacts.filter(
                          (p) =>
                            !filteredModalContacts.some((c) => c.phone === p)
                        )
                  )
                }
              />
              <span>Select / Deselect All</span>
            </div>

            {/* Contact List */}
            <div className="max-h-64 overflow-y-auto border rounded p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredModalContacts.map((c) => (
                  <label
                    key={c._id}
                    className="flex items-start gap-2 text-sm p-2 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedContacts.includes(c.phone)}
                      onChange={(e) => {
                        setSelectedContacts((prev) =>
                          e.target.checked
                            ? [...prev, c.phone]
                            : prev.filter((p) => p !== c.phone)
                        );
                      }}
                    />
                    <span className="leading-tight">
                      <span className="block font-medium text-gray-800">
                        {c.name}
                      </span>
                      <span className="block text-gray-500 text-xs">
                        {c.phone}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-4 py-2 border rounded"
                onClick={() => setShowContactModal(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
                disabled={!selectedContacts.length}
                onClick={() => {
                  setShowContactModal(false);
                  sendToContacts(selectedContacts, pendingType);
                }}
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
