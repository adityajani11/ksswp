const express = require("express");
const auth = require("../middleware/auth");
const { createSignedUpload } = require("../controllers/upload.controller");

const router = express.Router();

router.post("/signed-url", auth, createSignedUpload);

module.exports = router;
