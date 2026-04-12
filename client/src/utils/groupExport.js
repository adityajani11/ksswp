const EXCEL_FILE_NAME = "All_Groups_Data.xlsx";
const COMBINED_PDF_FILE_NAME = "All_Groups_Data.pdf";
const PDF_ZIP_FILE_NAME = "All_Groups_PDFs.zip";
const TABLE_HEADERS = ["Sr No.", "Name", "Contact Number"];
const PDF_TOP_MARGIN = 30;

function normalizeName(name, fallback = "Untitled Group") {
  const nextName = String(name || "").trim();
  return nextName || fallback;
}

function normalizePhone(phone) {
  const value = String(phone || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("+") ? value : `+${value}`;
}

function normalizeContacts(contacts) {
  return Array.isArray(contacts)
    ? contacts.map((contact) => ({
        name: String(contact?.name || "").trim(),
        phone: normalizePhone(contact?.phone),
      }))
    : [];
}

function buildContactRows(contacts) {
  return contacts.map((contact, index) => [
    index + 1,
    contact.name,
    contact.phone,
  ]);
}

function sanitizeSheetName(name) {
  const sanitized = normalizeName(name, "Sheet")
    .replace(/[:\\/?*\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized.slice(0, 31) || "Sheet";
}

function getUniqueSheetName(name, usedSheetNames) {
  const baseName = sanitizeSheetName(name);
  let nextName = baseName;
  let counter = 2;

  while (usedSheetNames.has(nextName)) {
    const suffix = ` (${counter})`;
    nextName = `${baseName.slice(0, Math.max(0, 31 - suffix.length)).trimEnd()}${suffix}`;
    counter += 1;
  }

  usedSheetNames.add(nextName);
  return nextName;
}

function sanitizeFileName(name, fallback = "Export") {
  const sanitized = normalizeName(name, fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized || fallback;
}

function getUniqueFileName(fileName, usedFileNames) {
  const extensionIndex = fileName.lastIndexOf(".");
  const hasExtension = extensionIndex > 0;
  const baseName = hasExtension ? fileName.slice(0, extensionIndex) : fileName;
  const extension = hasExtension ? fileName.slice(extensionIndex) : "";
  let nextName = fileName;
  let counter = 2;

  while (usedFileNames.has(nextName.toLowerCase())) {
    nextName = `${baseName} (${counter})${extension}`;
    counter += 1;
  }

  usedFileNames.add(nextName.toLowerCase());
  return nextName;
}

function downloadBlob(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = blobUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
  }, 0);
}

async function loadExcelModule() {
  return import("xlsx");
}

async function loadPdfModules() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  return { jsPDF, autoTable };
}

async function loadZipModule() {
  return import("fflate");
}

function createPdfDocument(jsPDF) {
  return new jsPDF({
    compress: true,
    putOnlyUsedFonts: true,
  });
}

function drawGroupHeading(doc, groupName) {
  const lines = doc.splitTextToSize(normalizeName(groupName).toUpperCase(), 180);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(lines, 14, 16);
  doc.setFont("helvetica", "normal");
}

function renderGroupPdfSection(doc, autoTable, group, { addPage = false } = {}) {
  if (addPage) {
    doc.addPage();
  }

  const body = buildContactRows(group.contacts);

  if (!body.length) {
    drawGroupHeading(doc, group.name);
    doc.setFontSize(11);
    doc.text("No contacts available.", 14, PDF_TOP_MARGIN);
    return;
  }

  autoTable(doc, {
    startY: PDF_TOP_MARGIN,
    margin: {
      top: PDF_TOP_MARGIN,
    },
    head: [TABLE_HEADERS],
    body,
    styles: {
      fontSize: 10,
      cellPadding: 2.5,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      fontStyle: "bold",
    },
    didDrawPage: () => {
      drawGroupHeading(doc, group.name);
    },
  });
}

export function createExportGroup(group, contacts = group?.contacts) {
  return {
    name: normalizeName(group?.name),
    contacts: normalizeContacts(contacts),
  };
}

export async function exportGroupsToExcel(groups, { fileName = EXCEL_FILE_NAME } = {}) {
  const XLSX = await loadExcelModule();
  const workbook = XLSX.utils.book_new();
  const usedSheetNames = new Set();
  const normalizedGroups = groups.map((group) => createExportGroup(group));

  for (const group of normalizedGroups) {
    const worksheet = XLSX.utils.aoa_to_sheet([
      TABLE_HEADERS,
      ...buildContactRows(group.contacts),
    ]);

    worksheet["!cols"] = [{ wch: 10 }, { wch: 30 }, { wch: 20 }];

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      getUniqueSheetName(group.name, usedSheetNames),
    );
  }

  XLSX.writeFile(workbook, fileName);
}

export async function exportGroupToExcel(group, options) {
  return exportGroupsToExcel([group], {
    fileName: `${sanitizeFileName(group?.name, "Group")}_Contacts.xlsx`,
    ...options,
  });
}

export async function exportGroupsToCombinedPdf(
  groups,
  { fileName = COMBINED_PDF_FILE_NAME } = {},
) {
  const { jsPDF, autoTable } = await loadPdfModules();
  const doc = createPdfDocument(jsPDF);
  const normalizedGroups = groups.map((group) => createExportGroup(group));

  normalizedGroups.forEach((group, index) => {
    renderGroupPdfSection(doc, autoTable, group, {
      addPage: index > 0,
    });
  });

  doc.save(fileName);
}

export async function exportGroupToPdf(group, options) {
  return exportGroupsToCombinedPdf([group], {
    fileName: `${sanitizeFileName(group?.name, "Group")}_Contacts.pdf`,
    ...options,
  });
}

export async function exportGroupsToPdfZip(
  groups,
  { fileName = PDF_ZIP_FILE_NAME } = {},
) {
  const [{ jsPDF, autoTable }, { zipSync }] = await Promise.all([
    loadPdfModules(),
    loadZipModule(),
  ]);
  const normalizedGroups = groups.map((group) => createExportGroup(group));
  const usedFileNames = new Set();
  const zipEntries = {};

  for (const group of normalizedGroups) {
    const doc = createPdfDocument(jsPDF);

    renderGroupPdfSection(doc, autoTable, group);

    const entryName = getUniqueFileName(
      `${sanitizeFileName(group.name, "Group")}.pdf`,
      usedFileNames,
    );

    zipEntries[entryName] = new Uint8Array(doc.output("arraybuffer"));
  }

  const zipFile = zipSync(zipEntries, { level: 0 });
  downloadBlob(new Blob([zipFile], { type: "application/zip" }), fileName);
}
