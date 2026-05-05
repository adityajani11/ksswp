const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const superadminController = require("../controllers/superadmin.controller");
const superadminAuth = require("../middleware/superadminAuth");

// Rate limit for SuperAdmin login: max 5 times
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per `window` (here, per 15 minutes)
  message: { success: false, message: "Too many login attempts, please try again after 15 minutes" },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

router.post("/setup", superadminController.setupSuperAdmin);
router.post("/login", loginLimiter, superadminController.login);

router.get("/users", superadminAuth, superadminController.getUsers);
router.post("/users", superadminAuth, superadminController.createUser);
router.put("/users/:id/rename", superadminAuth, superadminController.renameUser);
router.put("/users/:id/status", superadminAuth, superadminController.toggleUserStatus);
router.delete("/users/:id", superadminAuth, superadminController.deleteUser);

module.exports = router;
