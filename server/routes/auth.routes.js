const router = require("express").Router();
const authController = require("../controllers/auth.controller");
const auth = require("../middleware/auth");

// Auth routes
router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/profile", auth, authController.getProfile);
router.post("/send-otp", auth, authController.sendCredentialOtp);
router.post(
  "/verify-otp/change-username",
  auth,
  authController.verifyOtpAndChangeUsername,
);
router.post(
  "/verify-otp/change-login-password",
  auth,
  authController.verifyOtpAndChangeLoginPassword,
);
router.post(
  "/verify-otp/change-delete-password",
  auth,
  authController.verifyOtpAndChangeDeletePassword,
);
router.post(
  "/verify-otp/change-contact-number",
  auth,
  authController.verifyOtpAndChangeContactNumber,
);
router.post("/change-password", auth, authController.changePassword);

module.exports = router;
