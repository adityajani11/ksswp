import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Layers3,
  Phone,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { getContactPhoneValue, toDisplayPhone } from "../utils/phone";


export default function RecipientSelectionModal({
  open,
  onClose,
  onSubmit,
  submitLabel = "Send",
  groups,
  batches,
  groupsLoading,
  batchesLoading,
  mobileSearchLoading,
  mobileSearchMatches,
  selectionLoading,
  selectedGroups,
  selectedBatches,
  selectedContacts,
  selectedIndividualDetails = [],
  expandedGroups,
  search,
  setSearch,
  mobileSearch,
  setMobileSearch,
  discardSelection,
  isGroupLoading,
  toggleContact,
  toggleGroup,
  toggleBatch,
  toggleGroupExpand,
  selectAll,
}) {
  const [showMobileSearchPopup, setShowMobileSearchPopup] = useState(false);
  const popupRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        setShowMobileSearchPopup(false);
      }
    };
    if (showMobileSearchPopup) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showMobileSearchPopup]);

  if (!open) {
    return null;
  }

  return (
    <div className="app-modal-shell" role="dialog" aria-modal="true">
      <div className="app-overlay" onClick={onClose} />

      <div className="app-modal app-modal-lg recipient-modal">
        <div className="app-modal-header">
          <div>
            <h3 className="app-modal-title">Select Recipients</h3>
            <p className="app-modal-subtitle">
              Choose individual contacts, full groups, or prepared batches for
              this campaign.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="chip chip-primary">
              {selectedContacts.length} selected
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              onClick={onClose}
              aria-label="Close recipient selection"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="app-modal-body recipient-modal-body">
          <div className="app-search-grid" style={{ gridTemplateColumns: "1fr auto" }}>
            <label className="app-search-field">
              <Search size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search group name..."
                className="app-search-input"
              />
            </label>

            <div className="relative" ref={popupRef}>
              <button
                type="button"
                onClick={() => setShowMobileSearchPopup(!showMobileSearchPopup)}
                className={`search-button btn btn-icon ${
                  showMobileSearchPopup || mobileSearch.trim()
                    ? "btn-primary"
                    : "btn-secondary"
                }`}
                title="Search by mobile number"
              >
                <Phone size={18} />
              </button>

              {showMobileSearchPopup && (
                <div
                  className="absolute right-0 mt-2 w-80 z-50 overflow-hidden rounded-2xl border border-slate-200/60 shadow-2xl animate-in fade-in zoom-in duration-200"
                  style={{
                    background: "rgba(255, 255, 255, 0.85)",
                    backdropFilter: "blur(16px) saturate(180%)",
                  }}
                >
                  <div className="p-4 border-b border-slate-100/50 bg-white/50">
                    <label className="app-search-field mb-0">
                      <Search size={16} />
                      <input
                        autoFocus
                        value={mobileSearch}
                        onChange={(e) => setMobileSearch(e.target.value)}
                        placeholder="Type mobile number..."
                        className="app-search-input"
                      />
                    </label>
                  </div>

                  <div className="max-h-64 overflow-y-auto p-2">
                    {mobileSearchLoading ? (
                      <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-400">
                        <Search size={20} className="animate-pulse" />
                        <span className="text-xs font-medium">Searching...</span>
                      </div>
                    ) : !mobileSearch.trim() ? (
                      <div className="p-2">
                        <div className="py-2 text-center text-xs text-slate-400 font-medium">
                          Enter a number to start searching
                        </div>
                        
                        {selectedIndividualDetails.length > 0 && (
                          <>
                            <div className="my-2 border-t border-slate-100/60" />
                            <div className="px-1 mb-2">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Selected ({selectedIndividualDetails.length})
                              </span>
                            </div>
                            <div className="grid gap-1">
                              {selectedIndividualDetails.map((match, idx) => {
                                return (
                                  <label
                                    key={`sel-${match.phone}-${idx}`}
                                    className="flex items-center gap-3 p-2.5 rounded-xl transition-all cursor-pointer border bg-emerald-50/40 border-emerald-100/30"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={true}
                                      onChange={() => toggleContact(match.phone)}
                                      className="w-4 h-4 rounded-md border-slate-300 text-emerald-600 focus:ring-emerald-500/20"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm font-bold truncate text-emerald-700">
                                        {match.name || match.displayPhone}
                                      </div>
                                      {match.name && (
                                        <div className="text-[10px] text-slate-400 font-medium leading-tight">
                                          {match.displayPhone}
                                        </div>
                                      )}
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    ) : mobileSearchMatches.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500 font-medium italic">
                        No matches found
                      </div>
                    ) : (
                      <div className="grid gap-1">
                        {mobileSearchMatches.map((match, idx) => {
                          const matchPhone = match.phone;
                          const displayName = match.name || match.displayPhone || "Unnamed";
                          const isSelected = selectedContacts.includes(matchPhone);

                          return (
                            <label
                              key={match.id || `m-${matchPhone}-${idx}`}
                              className={`flex items-center gap-3 p-2.5 rounded-xl transition-all cursor-pointer border ${
                                isSelected
                                  ? "bg-emerald-50 border-emerald-100/50"
                                  : "hover:bg-slate-50 border-transparent"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleContact(matchPhone)}
                                className="w-4 h-4 rounded-md border-slate-300 text-emerald-600 focus:ring-emerald-500/20"
                              />
                              <div className="min-w-0 flex-1">
                                <div className={`text-sm font-bold truncate ${isSelected ? "text-emerald-700" : "text-slate-700"}`}>
                                  {displayName}
                                </div>
                                {match.name && (
                                  <div className="text-[10px] text-slate-400 font-medium leading-tight">
                                    {match.displayPhone}
                                  </div>
                                )}
                                {match.groupNames?.length ? (
                                  <div className="text-[10px] text-slate-400 truncate leading-tight">
                                    {match.groupNames[0]}
                                    {match.groupNames.length > 1 && ` +${match.groupNames.length - 1} more`}
                                  </div>
                                ) : null}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>


          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAll}
              disabled={selectionLoading || groupsLoading}
              className="btn btn-secondary btn-sm"
            >
              {selectionLoading ? "Selecting..." : "Select All"}
            </button>

            <button
              type="button"
              onClick={discardSelection}
              className="btn btn-ghost-danger btn-sm"
            >
              Discard
            </button>
          </div>

          <div className="recipient-panel-grid">
            <section className="recipient-section recipient-panel">
              <div className="recipient-section-header">
                <div className="recipient-title">
                  <Users size={16} />
                  Groups
                </div>
                <span className="chip chip-neutral">{groups.length} available</span>
              </div>

              <div className="recipient-scroll recipient-scroll-groups p-3 space-y-3">
                {groupsLoading ? (
                  <p className="text-sm text-slate-500">Loading groups...</p>
                ) : groups.length === 0 ? (
                  <div className="app-empty-state">No groups found.</div>
                ) : (
                  groups.map((group) => (
                    <div key={group._id} className="recipient-group-card">
                      <div className="recipient-group-header">
                        <button
                          type="button"
                          onClick={() => toggleGroupExpand(group._id)}
                          className="btn btn-secondary btn-icon h-9 w-9"
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

                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-slate-800">
                            {group.name}
                          </div>
                          <div className="recipient-mini-note">
                            {group.contactCount || 0} contacts
                          </div>
                        </div>
                      </div>

                      {expandedGroups.includes(group._id) && (
                        <div className="recipient-contact-grid">
                          {(() => {
                            if (isGroupLoading(group._id)) {
                              return (
                                <p className="text-sm text-slate-500">
                                  Loading contacts...
                                </p>
                              );
                            }

                            if ((group.contacts || []).length === 0) {
                              return (
                                <p className="text-sm text-slate-500">
                                  No contacts in this group.
                                </p>
                              );
                            }

                            return (group.contacts || []).map((contact) => {
                              const contactPhone = getContactPhoneValue(contact);
                              const displayPhone = toDisplayPhone(contactPhone);

                              return (
                                <label
                                  key={contactPhone || contact.name || "contact"}
                                  className="recipient-contact-pill cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedContacts.includes(contactPhone)}
                                    onChange={() => toggleContact(contactPhone)}
                                    disabled={!contactPhone}
                                  />
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold text-slate-800">
                                      {contact.name || displayPhone || "Unnamed"}
                                    </span>
                                    {displayPhone ? (
                                      <span className="block recipient-mini-note">
                                        {displayPhone}
                                      </span>
                                    ) : null}
                                  </span>
                                </label>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="recipient-section recipient-panel">
              <div className="recipient-section-header">
                <div className="recipient-title">
                  <Layers3 size={16} />
                  Batches
                </div>
                <span className="chip chip-neutral">{batches.length} available</span>
              </div>

              <div className="recipient-scroll recipient-scroll-batches">
                {batchesLoading ? (
                  <div className="p-4 text-sm text-slate-500">Loading batches...</div>
                ) : batches.length === 0 ? (
                  <div className="app-empty-state rounded-none border-0">
                    No batches found.
                  </div>
                ) : (
                  batches.map((batch) => (
                    <label key={batch._id} className="recipient-choice">
                      <div className="recipient-choice-main">
                        <input
                          type="checkbox"
                          checked={selectedBatches.includes(batch._id)}
                          onChange={() => toggleBatch(batch)}
                          disabled={selectionLoading}
                        />
                        <div className="recipient-choice-copy">
                          <div className="truncate text-sm font-semibold text-slate-800">
                            {batch.name}
                          </div>
                          <div className="recipient-mini-note">
                            {batch.groupCount || batch.groupIds?.length || 0} groups,
                            {" "}
                            {batch.contactCount || 0} contacts
                          </div>
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="app-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selectedContacts.length}
            onClick={onSubmit}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
