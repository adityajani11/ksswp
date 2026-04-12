import Swal from "sweetalert2";
import { Trash2 } from "lucide-react";

export default function ContactTable({ contacts, onDelete }) {
  if (!contacts.length) {
    return (
      <div className="text-center text-gray-500 py-6">No contacts found</div>
    );
  }

  const confirmDelete = (id, name) => {
    Swal.fire({
      title: "Delete Contact?",
      text: `Are you sure you want to delete "${name}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
    }).then((result) => {
      if (result.isConfirmed) {
        onDelete(id);
      }
    });
  };

  return (
    <div className="overflow-x-auto bg-white shadow rounded">
      <table className="min-w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-3 border text-left">#</th>
            <th className="p-3 border text-left">Name</th>
            <th className="p-3 border text-left">Phone</th>
            <th className="p-3 border text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c, i) => (
            <tr key={c._id} className="hover:bg-gray-50">
              <td className="p-3 border">{i + 1}</td>
              <td className="p-3 border">{c.name}</td>
              <td className="p-3 border">{c.phone}</td>
              <td className="p-3 border text-center">
                <button
                  onClick={() => confirmDelete(c._id, c.name)}
                  className="text-red-600 hover:text-red-800"
                  title="Delete"
                >
                  <Trash2 size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
