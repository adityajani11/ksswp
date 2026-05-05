import { useState } from "react";
import api from "../utils/api";
import Swal from "sweetalert2";
import { runWithSwalLoader } from "../utils/swalLoading";
import { invalidateGroupDirectoryCache } from "../utils/groupDirectory";

export default function CreateGroup() {
  const [name, setName] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;

    try {
      await runWithSwalLoader(
        {
          title: "Creating group",
          text: "Saving the new group...",
        },
        () => api.post("/groups", { name: name.trim() }),
      );
      invalidateGroupDirectoryCache();
      Swal.fire("Success", "Group created", "success");
      setName("");
    } catch (err) {
      Swal.fire("Error", err.response?.data?.message || "Failed", "error");
    }
  };

  return (
    <div className="max-w-md bg-white p-4 rounded shadow">
      <h3 className="text-lg font-semibold mb-3">Create Group</h3>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group Name"
        className="w-full border p-2 rounded mb-3"
      />

      <button
        onClick={handleCreate}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Create
      </button>
    </div>
  );
}
