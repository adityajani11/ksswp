const router = require("express").Router();
const authController = require("../controllers/auth.controller");
const auth = require("../middleware/auth");

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/change-password", auth, authController.changePassword);

module.exports = router;
