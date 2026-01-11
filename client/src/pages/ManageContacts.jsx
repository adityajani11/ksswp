import { useEffect, useState } from "react";
import api from "../utils/api";
import Swal from "sweetalert2";
import ContactTable from "../components/ContactTable";
import AddContactModal from "../components/AddContactModal";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function ManageContacts() {
  const [contacts, setContacts] = useState([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const loadContacts = async () => {
    const res = await api.get("/contacts");
    setContacts(res.data);
  };

  const buildExportData = () =>
    filteredContacts.map((c, index) => ({
      "Sr No.": index + 1,
      Name: c.name,
      "Contact Number": c.phone,
      "Registered On": new Date(c.createdAt).toLocaleDateString("en-IN"),
    }));

  useEffect(() => {
    loadContacts();
  }, []);

  const filteredContacts = contacts.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)
    );
  });

  const confirmDownload = async (type, onConfirm) => {
    const result = await Swal.fire({
      title: `Download ${type}?`,
      text: `Do you want to download contacts as ${type}?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Download",
      cancelButtonText: "Cancel",
    });

    if (result.isConfirmed) {
      onConfirm();
    }
  };

  const exportExcel = () => {
    if (!contacts.length) {
      Swal.fire("No data", "No contacts to export", "warning");
      return;
    }

    confirmDownload("Excel", () => {
      const data = buildExportData();

      const ws = XLSX.utils.json_to_sheet(data, {
        header: ["Sr No.", "Name", "Contact Number", "Registered On"],
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Contacts");

      XLSX.writeFile(wb, "contacts.xlsx");
    });
  };

  const exportPDF = () => {
    if (!contacts.length) {
      Swal.fire("No data", "No contacts to export", "warning");
      return;
    }

    confirmDownload("PDF", () => {
      const doc = new jsPDF();

      doc.setFontSize(14);
      doc.text("Contacts List", 14, 15);

      const tableData = buildExportData().map((row) => [
        row["Sr No."],
        row.Name,
        row["Contact Number"],
        row["Registered On"],
      ]);

      autoTable(doc, {
        startY: 20,
        head: [["Sr No.", "Name", "Contact Number", "Registered On"]],
        body: tableData,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [37, 99, 235] },
      });

      doc.save("contacts.pdf");
    });
  };

  const deleteContact = async (id) => {
    try {
      await api.delete(`/contacts/${id}`);
      Swal.fire("Deleted!", "Contact removed successfully", "success");
      loadContacts();
    } catch (err) {
      Swal.fire(
        "Error",
        err.response?.data?.message || "Failed to delete contact",
        "error"
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h3 className="text-2xl font-bold">Manage Contacts</h3>
        <div className="space-x-2">
          <button onClick={() => setOpen(true)} className="btn">
            Add Contact
          </button>
          <button onClick={exportExcel} className="btn">
            Export Excel
          </button>
          <button onClick={exportPDF} className="btn">
            Export PDF
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="relative w-full">
          {/* Icon */}
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>

          {/* Input */}
          <input
            type="text"
            placeholder="Search by name or contact number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="
              w-full pl-10 pr-4 py-2.5
              border border-gray-300 rounded-lg
              text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              transition
            "
          />
        </div>
      </div>

      <ContactTable contacts={filteredContacts} onDelete={deleteContact} />
      {open && (
        <AddContactModal
          onClose={() => setOpen(false)}
          onSaved={loadContacts}
        />
      )}
    </div>
  );
}
