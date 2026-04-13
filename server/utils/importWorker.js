const { parentPort, workerData } = require("worker_threads");
const XlsxStreamReader = require("xlsx-stream-reader");
const mongoose = require("mongoose");
const fs = require("fs");

const Group = require("../models/Group");
const ImportHistory = require("../models/ImportHistory");
const ImportJob = require("../models/ImportJob");
const ImportLog = require("../models/ImportLog");

const LOCAL_PHONE_REGEX = /^\d{10}$/;
const BATCH_SIZE = Math.max(
  200,
  Number(process.env.IMPORT_BATCH_SIZE || 1000) || 1000,
);
const STATUS_UPDATE_INTERVAL_MS = Math.max(
  500,
  Number(process.env.IMPORT_STATUS_UPDATE_INTERVAL_MS || 1000) || 1000,
);
const STATUS_UPDATE_ROW_INTERVAL = Math.max(
  100,
  Number(process.env.IMPORT_STATUS_UPDATE_ROW_INTERVAL || 250) || 250,
);
const FALLBACK_SHEET_NAME_PREFIX = "Sheet";

function formatPhone(phone) {
  return `91${String(phone).trim()}`;
}

function normalizePhone(rawPhone) {
  return String(rawPhone || "").replace(/\D/g, "");
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`[Worker] Unable to remove temp file ${filePath}:`, err);
  }
}

async function createGroupWithUniqueName({
  baseName,
  contacts,
  createdBy,
  importJobId,
}) {
  const normalizedBaseName =
    String(baseName || "").trim() || `${FALLBACK_SHEET_NAME_PREFIX} Imported`;

  let suffix = 1;
  while (true) {
    const candidateName =
      suffix === 1 ? normalizedBaseName : `${normalizedBaseName} (${suffix})`;

    try {
      return await Group.create({
        name: candidateName,
        contacts,
        createdBy,
        importJobId,
      });
    } catch (err) {
      if (err?.code === 11000) {
        suffix += 1;
        continue;
      }

      throw err;
    }
  }
}

function formatExistingGroupNames(groupNames) {
  const normalizedGroupNames = [...new Set(
    (Array.isArray(groupNames) ? groupNames : [])
      .map((groupName) => String(groupName || "").trim())
      .filter(Boolean),
  )];

  if (!normalizedGroupNames.length) {
    return "another group";
  }

  return normalizedGroupNames
    .sort((left, right) => left.localeCompare(right))
    .map((groupName) => `"${groupName}"`)
    .join(", ");
}

function buildExistingPhoneReason(groupNames) {
  return `Phone already exists in ${formatExistingGroupNames(groupNames)}`;
}

async function loadExistingDatabasePhoneGroupsMap() {
  const groups = await Group.find()
    .select("name contacts.phone")
    .lean();
  const groupsByPhone = new Map();

  for (const group of Array.isArray(groups) ? groups : []) {
    const groupName = String(group?.name || "").trim() || "Unnamed group";
    const contacts = Array.isArray(group?.contacts) ? group.contacts : [];

    for (const contact of contacts) {
      const phone = String(contact?.phone || "").trim();
      if (!phone) {
        continue;
      }

      if (!groupsByPhone.has(phone)) {
        groupsByPhone.set(phone, new Set());
      }

      groupsByPhone.get(phone).add(groupName);
    }
  }

  const serializedGroupsByPhone = new Map();
  for (const [phone, groupNames] of groupsByPhone.entries()) {
    serializedGroupsByPhone.set(phone, [...groupNames]);
  }

  return serializedGroupsByPhone;
}

function processWorkbook(filePath, createWorksheetTask) {
  return new Promise((resolve, reject) => {
    const workbookReader = new XlsxStreamReader();
    const fileStream = fs.createReadStream(filePath);
    const worksheetTasks = [];
    let settled = false;

    const rejectOnce = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    workbookReader.on("worksheet", (worksheet) => {
      let taskPromise;
      try {
        taskPromise = Promise.resolve(createWorksheetTask(worksheet));
      } catch (err) {
        rejectOnce(err);
        return;
      }

      worksheetTasks.push(taskPromise);
      taskPromise.catch(rejectOnce);

      if (typeof worksheet.process === "function") {
        try {
          worksheet.process();
        } catch (err) {
          rejectOnce(err);
        }
      }
    });

    workbookReader.on("error", rejectOnce);
    fileStream.on("error", rejectOnce);

    workbookReader.on("end", async () => {
      if (settled) return;

      try {
        await Promise.all(worksheetTasks);
        settled = true;
        resolve();
      } catch (err) {
        rejectOnce(err);
      }
    });

    fileStream.pipe(workbookReader);
  });
}

async function countRowsInWorkbook(filePath) {
  let totalRows = 0;

  await processWorkbook(filePath, (worksheet) => {
    return new Promise((resolve, reject) => {
      let rowNumber = 0;

      worksheet.on("row", () => {
        rowNumber += 1;
        if (rowNumber > 1) {
          totalRows += 1;
        }
      });

      worksheet.on("error", reject);
      worksheet.on("end", resolve);
    });
  });

  return totalRows;
}

async function start() {
  const { jobId, filePath, originalName, userId, mongoUri } = workerData;

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    const job = await ImportJob.findById(jobId).lean();
    if (!job) {
      parentPort.postMessage({ type: "error", error: "Job not found in worker" });
      return;
    }

    let processedSoFar = 0;
    let totalImported = 0;
    let totalSkipped = 0;
    let currentPhase = "counting";
    let totalRows = 0;
    let lastStatusUpdateAt = 0;
    let lastStatusProcessed = 0;
    const jobStartMs = job.startTime ? new Date(job.startTime).getTime() : Date.now();
    let statusWriteQueue = Promise.resolve();

    const queueStatusUpdate = ({ force = false, phase = currentPhase } = {}) => {
      const now = Date.now();
      const rowDelta = processedSoFar - lastStatusProcessed;
      const shouldUpdate =
        force ||
        now - lastStatusUpdateAt >= STATUS_UPDATE_INTERVAL_MS ||
        rowDelta >= STATUS_UPDATE_ROW_INTERVAL;

      if (!shouldUpdate) {
        return statusWriteQueue;
      }

      lastStatusUpdateAt = now;
      lastStatusProcessed = processedSoFar;

      const boundedProcessed = totalRows
        ? Math.min(processedSoFar, totalRows)
        : processedSoFar;

      let progress = 0;
      if (totalRows > 0) {
        progress = Math.floor((boundedProcessed / totalRows) * 100);
      }

      if (phase === "counting") {
        progress = 0;
      } else if (phase === "processing") {
        progress = Math.min(progress, 99);
      } else if (phase === "finalizing") {
        progress = Math.max(99, progress);
      }

      let eta = 0;
      if (phase === "processing" && totalRows > 0 && boundedProcessed > 0) {
        const elapsedSeconds = Math.max(
          1,
          Math.floor((now - jobStartMs) / 1000),
        );
        const speed = boundedProcessed / elapsedSeconds;

        if (speed > 0 && boundedProcessed < totalRows) {
          eta = Math.ceil((totalRows - boundedProcessed) / speed);
        }
      }

      const updatePayload = {
        status: "processing",
        phase,
        total: totalRows,
        processed: boundedProcessed,
        imported: totalImported,
        skipped: totalSkipped,
        progress,
        eta,
        error: null,
      };

      statusWriteQueue = statusWriteQueue
        .then(() => ImportJob.findByIdAndUpdate(jobId, updatePayload))
        .catch((err) => {
          console.error("[Worker] Status update failed:", err);
        });

      return statusWriteQueue;
    };

    await ImportJob.findByIdAndUpdate(jobId, {
      status: "processing",
      phase: "counting",
      total: 0,
      processed: 0,
      imported: 0,
      skipped: 0,
      progress: 0,
      eta: 0,
      error: null,
    });

    totalRows = await countRowsInWorkbook(filePath);
    currentPhase = "processing";

    await ImportJob.findByIdAndUpdate(jobId, {
      status: "processing",
      phase: "processing",
      total: totalRows,
      processed: 0,
      imported: 0,
      skipped: 0,
      progress: 0,
      eta: 0,
      error: null,
    });

    const existingDatabasePhoneGroupsMap = await loadExistingDatabasePhoneGroupsMap();
    const importedPhoneSet = new Set();

    await processWorkbook(filePath, (worksheet) => {
      return new Promise((resolve, reject) => {
        const sheetName =
          String(worksheet.name || "").trim() ||
          `${FALLBACK_SHEET_NAME_PREFIX} ${Math.max(1, processedSoFar + 1)}`;
        let rowCountInSheet = 0;
        let headerMap = {};
        let batchBuffer = [];
        let batchQueue = Promise.resolve();
        let batchError = null;
        let validContactsForSheet = [];
        const seenPhonesInSheet = new Set();
        let hasRequiredHeaders = false;

        const enqueueBatch = (batch) => {
          if (!batch.length) {
            return;
          }

          const batchToProcess = batch;
          batchQueue = batchQueue
            .then(async () => {
              if (batchError) {
                return;
              }

              const candidateByPhone = new Map();
              const logEntries = [];

              for (const item of batchToProcess) {
                const rawName = String(item.name || "").trim();
                const originalPhone = String(item.phone || "").trim();
                const rawPhone = normalizePhone(originalPhone);

                if (!rawName && !rawPhone) {
                  continue;
                }

                if (!rawName) {
                  totalSkipped += 1;
                  logEntries.push({
                    jobId,
                    sheetName,
                    row: item.rowNum,
                    name: "(empty)",
                    contact_number: originalPhone,
                    reason: "Missing Name",
                  });
                  continue;
                }

                if (!LOCAL_PHONE_REGEX.test(rawPhone)) {
                  totalSkipped += 1;
                  logEntries.push({
                    jobId,
                    sheetName,
                    row: item.rowNum,
                    name: rawName,
                    contact_number: originalPhone,
                    reason: "Phone must be exactly 10 digits",
                  });
                  continue;
                }

                const formattedPhone = formatPhone(rawPhone);
                if (
                  seenPhonesInSheet.has(formattedPhone) ||
                  candidateByPhone.has(formattedPhone)
                ) {
                  totalSkipped += 1;
                  logEntries.push({
                    jobId,
                    sheetName,
                    row: item.rowNum,
                    name: rawName,
                    contact_number: originalPhone,
                    reason: `Duplicate found in ${sheetName}`,
                  });
                  continue;
                }

                if (importedPhoneSet.has(formattedPhone)) {
                  totalSkipped += 1;
                  logEntries.push({
                    jobId,
                    sheetName,
                    row: item.rowNum,
                    name: rawName,
                    contact_number: originalPhone,
                    reason: "Duplicate found in this import file",
                  });
                  continue;
                }

                const existingGroupNames =
                  existingDatabasePhoneGroupsMap.get(formattedPhone) || [];
                if (existingGroupNames.length > 0) {
                  totalSkipped += 1;
                  logEntries.push({
                    jobId,
                    sheetName,
                    row: item.rowNum,
                    name: rawName,
                    contact_number: originalPhone,
                    reason: buildExistingPhoneReason(existingGroupNames),
                  });
                  continue;
                }

                candidateByPhone.set(formattedPhone, {
                  rowNum: item.rowNum,
                  name: rawName,
                  originalPhone,
                });
              }

              for (const phone of candidateByPhone.keys()) {
                const info = candidateByPhone.get(phone);
                seenPhonesInSheet.add(phone);
                importedPhoneSet.add(phone);
                validContactsForSheet.push({
                  name: info.name,
                  phone,
                });
                totalImported += 1;
              }

              if (logEntries.length > 0) {
                await ImportLog.insertMany(logEntries, { ordered: false });
              }

              await queueStatusUpdate();
            })
            .catch((err) => {
              batchError = err;
            });
        };

        worksheet.on("row", (row) => {
          rowCountInSheet += 1;
          const rowValues = Array.isArray(row?.values) ? row.values : [];

          if (rowCountInSheet === 1) {
            headerMap = {};
            rowValues.forEach((value, index) => {
              const normalizedHeader = normalizeHeader(value);
              if (normalizedHeader === "name") {
                headerMap.name = index;
              } else if (
                normalizedHeader === "contact_number" ||
                normalizedHeader === "contactnumber" ||
                normalizedHeader === "contact_no"
              ) {
                headerMap.contact_number = index;
              }
            });
            hasRequiredHeaders =
              headerMap.name !== undefined &&
              headerMap.contact_number !== undefined;
            return;
          }

          processedSoFar += 1;

          if (!hasRequiredHeaders) {
            totalSkipped += 1;
            queueStatusUpdate();
            return;
          }

          batchBuffer.push({
            name:
              headerMap.name !== undefined ? rowValues[headerMap.name] : null,
            phone:
              headerMap.contact_number !== undefined
                ? rowValues[headerMap.contact_number]
                : null,
            rowNum: rowCountInSheet,
          });

          if (batchBuffer.length >= BATCH_SIZE) {
            const batch = batchBuffer;
            batchBuffer = [];
            enqueueBatch(batch);
          }

          queueStatusUpdate();
        });

        worksheet.on("error", reject);

        worksheet.on("end", async () => {
          try {
            if (batchBuffer.length > 0) {
              const finalBatch = batchBuffer;
              batchBuffer = [];
              enqueueBatch(finalBatch);
            }

            await batchQueue;
            if (batchError) {
              throw batchError;
            }

            if (validContactsForSheet.length > 0) {
              await createGroupWithUniqueName({
                baseName: sheetName,
                contacts: validContactsForSheet,
                createdBy: userId,
                importJobId: jobId,
              });
              validContactsForSheet = [];
            }

            await queueStatusUpdate({ force: true });
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });
    });

    currentPhase = "finalizing";
    await queueStatusUpdate({ force: true, phase: "finalizing" });
    await statusWriteQueue;

    const topLogs = await ImportLog.find({ jobId })
      .sort({ createdAt: 1 })
      .limit(1000)
      .lean();

    const duration = Math.max(
      1,
      Math.round((Date.now() - jobStartMs) / 1000),
    );

    const history = new ImportHistory({
      fileName: originalName,
      importedBy: userId,
      totalImported,
      totalSkipped,
      skipDetails: topLogs,
      duration,
    });
    await history.save();

    await ImportJob.findByIdAndUpdate(jobId, {
      status: "completed",
      phase: "completed",
      processed: totalRows,
      total: totalRows,
      imported: totalImported,
      skipped: totalSkipped,
      progress: 100,
      eta: 0,
      error: null,
      importHistoryId: history._id,
      filePath: null,
      completedAt: new Date(),
    });

    safeUnlink(filePath);
    parentPort.postMessage({ type: "done" });
    process.exit(0);
  } catch (err) {
    console.error("[Worker] Error:", err);

    try {
      if (mongoose.connection.readyState !== 0) {
        const currentJob = await ImportJob.findById(workerData.jobId)
          .select("status")
          .lean();

        if (currentJob?.status === "processing") {
          await ImportJob.findByIdAndUpdate(workerData.jobId, {
            status: "failed",
            phase: "failed",
            eta: 0,
            error: err.message || "Internal worker error",
            completedAt: new Date(),
          });

          await Group.deleteMany({ importJobId: workerData.jobId });
          await ImportLog.deleteMany({ jobId: workerData.jobId });
        }
      }
    } catch (updateErr) {
      console.error("[Worker] Failed to persist worker error:", updateErr);
    }

    safeUnlink(workerData.filePath);
    parentPort.postMessage({ type: "error", error: err.message });
    process.exit(1);
  }
}

start();
