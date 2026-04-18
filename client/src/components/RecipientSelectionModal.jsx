import {
  ChevronDown,
  ChevronRight,
  Layers3,
  Search,
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
          <div className="app-search-grid">
            <label className="app-search-field">
              <Search size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search group name..."
                className="app-search-input"
              />
            </label>

            <label className="app-search-field">
              <Search size={16} />
              <input
                value={mobileSearch}
                onChange={(e) => setMobileSearch(e.target.value)}
                placeholder="Search by mobile number..."
                className="app-search-input"
              />
            </label>
          </div>

          {String(mobileSearch || "").trim() && (
            <section className="recipient-section">
              <div className="recipient-section-header">
                <div className="recipient-title">
                  <Search size={16} />
                  Matching Numbers
                </div>
                <span className="chip chip-neutral">
                  {mobileSearchMatches.length} results
                </span>
              </div>

              <div
                className="recipient-scroll recipient-scroll-matches"
                style={{ flexShrink: 0 }}
              >
                {mobileSearchLoading ? (
                  <div className="flex items-center justify-center h-full gap-2 text-slate-500 animate-pulse py-6">
                    <Search size={18} />
                    <span className="text-sm font-medium">Searching contacts...</span>
                  </div>
                ) : mobileSearchMatches.length === 0 ? (
                  <div className="app-empty-state rounded-none border-0">
                    No matching mobile numbers found.
                  </div>
                ) : (
                  <div className="recipient-contact-grid recipient-match-grid">
                    {mobileSearchMatches.map((match, idx) => {
                      const matchPhone = match.phone;
                      const displayName = match.name || match.displayPhone || "Unnamed";
                      const subtitle = match.name ? match.displayPhone : "";

                      return (
                        <label
                          key={match.id || `m-${matchPhone}-${idx}`}
                          className="recipient-contact-pill cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedContacts.includes(matchPhone)}
                            onChange={() => toggleContact(matchPhone)}
                            disabled={!matchPhone}
                          />
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-800">
                              {displayName}
                            </span>
                            {subtitle && (
                              <span className="block recipient-mini-note">
                                {subtitle}
                              </span>
                            )}
                            {match.groupNames?.length ? (
                              <span className="block recipient-mini-note truncate">
                                {match.groupNames.join(", ")}
                              </span>
                            ) : null}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

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
