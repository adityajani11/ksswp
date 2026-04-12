const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");
const Group = require("../models/Group");
const ImportHistory = require("../models/ImportHistory");
const ImportJob = require("../models/ImportJob");
const ImportLog = require("../models/ImportLog");
const auth = require("../middleware/auth");
const activeImportWorkers = new Map();

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, `import-${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.match(/\.(xlsx|xls)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files are allowed"));
    }
  },
});

/**
 * Cleanup helper: wipes all incremental data created during a cancelled/aborted session.
 */
const cleanupImportSession = async (jobId) => {
  try {
    console.log(`[import] Wiping session data for jobId: ${jobId}`);
    // 1. Delete all groups tagged with this jobId
    await Group.deleteMany({ importJobId: jobId });
    // 2. Delete all incremental logs tagged with this jobId
    await ImportLog.deleteMany({ jobId: jobId });
    console.log(`[import] Cleanup complete for jobId: ${jobId}`);
  } catch (err) {
    console.error(`[import] Cleanup failed for jobId ${jobId}:`, err);
  }
};

const cleanupUploadFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`[import] Failed to clean temp file ${filePath}:`, err);
  }
};

router.post("/upload", auth, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded or invalid format" });
  }

  let childWorker = null;

  try {
    // 1) Create job track
    const job = new ImportJob({
      total: 0,
      status: "processing",
      phase: "queued",
      createdBy: req.user?.id || null,
      originalName: req.file.originalname,
      filePath: req.file.path,
    });
    await job.save();

    // 2) Spawn worker (increase memory limit for large XLSX unzip workloads)
    childWorker = new Worker(path.join(__dirname, "../utils/importWorker.js"), {
      workerData: {
        jobId: job._id.toString(),
        filePath: req.file.path,
        originalName: req.file.originalname,
        userId: req.user?.id ? req.user.id.toString() : null,
        mongoUri: process.env.MONGO_URI
      },
      resourceLimits: {
        maxOldGenerationSizeMb: 1024,
      },
    });

    const normalizedJobId = String(job._id);
    activeImportWorkers.set(normalizedJobId, childWorker);

    childWorker.on("exit", async (exitCode) => {
      try {
        activeImportWorkers.delete(normalizedJobId);

        if (exitCode === 0) {
          return;
        }

        const currentJob = await ImportJob.findById(normalizedJobId).lean();
        if (currentJob?.status === "processing") {
          await ImportJob.findByIdAndUpdate(normalizedJobId, {
            status: "failed",
            phase: "failed",
            error: "Import worker exited unexpectedly",
            eta: 0,
            completedAt: new Date(),
          });
          await cleanupImportSession(normalizedJobId);
          cleanupUploadFile(currentJob.filePath || req.file?.path);
        }
      } catch (exitErr) {
        console.error(`[import] Worker exit handling failed for ${normalizedJobId}:`, exitErr);
      }
    });

    childWorker.on("error", async (workerErr) => {
      try {
        console.error(`[import] Worker error for job ${normalizedJobId}:`, workerErr);
        activeImportWorkers.delete(normalizedJobId);

        const currentJob = await ImportJob.findById(normalizedJobId).lean();
        if (currentJob?.status === "processing") {
          await ImportJob.findByIdAndUpdate(normalizedJobId, {
            status: "failed",
            phase: "failed",
            error: workerErr?.message || "Worker terminated unexpectedly",
            eta: 0,
            completedAt: new Date(),
          });
          await cleanupImportSession(normalizedJobId);
          cleanupUploadFile(currentJob.filePath || req.file?.path);
        }
      } catch (errorHandlerErr) {
        console.error(`[import] Worker error handling failed for ${normalizedJobId}:`, errorHandlerErr);
      }
    });

    res.status(200).json({
      success: true,
      jobId: job._id,
    });
  } catch (err) {
    if (req.file) cleanupUploadFile(req.file.path);
    console.error("Excel upload error:", err);
    res.status(500).json({ message: "Server error while starting import" });
  }
});

router.get("/status/:jobId", auth, async (req, res) => {
  try {
    const job = await ImportJob.findById(req.params.jobId).lean();
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (job.createdBy && String(job.createdBy) !== String(req.user?.id || "")) {
      return res.status(404).json({ message: "Job not found" });
    }

    let history = null;
    if (job.status === "completed" && job.importHistoryId) {
      history = await ImportHistory.findById(job.importHistoryId).lean();
    }

    const endTime = job.completedAt ? new Date(job.completedAt).getTime() : Date.now();
    const startTime = job.startTime ? new Date(job.startTime).getTime() : endTime;
    const durationSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));

    res.json({ ...job, durationSeconds, history });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/cancel/:jobId", auth, async (req, res) => {
  try {
    const jobId = String(req.params.jobId || "");
    const job = await ImportJob.findById(jobId).lean();

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    if (job.createdBy && String(job.createdBy) !== String(req.user?.id || "")) {
      return res.status(404).json({ message: "Job not found" });
    }

    if (job.status !== "processing") {
      return res.json({ success: true, status: job.status });
    }

    const activeWorker = activeImportWorkers.get(jobId);
    if (activeWorker) {
      await activeWorker.terminate();
      activeImportWorkers.delete(jobId);
    }

    await ImportJob.findByIdAndUpdate(jobId, {
      status: "cancelled",
      phase: "cancelled",
      error: "Import cancelled by user",
      eta: 0,
      completedAt: new Date(),
    });

    await cleanupImportSession(jobId);
    cleanupUploadFile(job.filePath);

    return res.json({ success: true, status: "cancelled" });
  } catch (err) {
    console.error("[import] Cancel error:", err);
    return res.status(500).json({ message: "Server error while cancelling import" });
  }
});

router.get("/history", auth, async (req, res) => {
  try {
    const history = await ImportHistory.find().sort({ createdAt: -1 }).populate("importedBy", "username").lean();
    res.json(history);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/history/clear", auth, async (req, res) => {
  try {
    await ImportHistory.deleteMany({});
    // Note: We don't wipe ImportLogs here as they are session-specific and already capped in history
    res.json({ message: "Import history cleared successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error while clearing history" });
  }
});

router.delete("/history/:id", auth, async (req, res) => {
  try {
    const history = await ImportHistory.findByIdAndDelete(req.params.id);
    if (!history) return res.status(404).json({ message: "History record not found" });
    res.json({ message: "History record deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error while deleting history" });
  }
});

module.exports = router;
