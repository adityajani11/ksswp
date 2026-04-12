const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  const authHeader = req.header("Authorization");
  if (!authHeader) {
    return res.status(401).json({ success: false, message: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1] || authHeader;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isSuperAdmin) {
       return res.status(403).json({ success: false, message: "Forbidden. Not a super admin." });
    }
    req.superAdmin = decoded;
    next();
  } catch (ex) {
    res.status(400).json({ success: false, message: "Invalid token." });
  }
};
