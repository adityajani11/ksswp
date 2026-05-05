const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const SuperAdmin = require("../models/SuperAdmin");
const User = require("../models/User");

// 1. Setup the ONE AND ONLY Super Admin account
exports.setupSuperAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required" });
    }

    const count = await SuperAdmin.countDocuments();
    if (count > 0) {
      return res.status(403).json({ success: false, message: "Super Admin already setup" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const superAdmin = await SuperAdmin.create({
      username,
      password: hashedPassword,
    });

    return res.status(201).json({ success: true, message: "Super Admin created successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Setup failed", error: err.message });
  }
};

// 2. Login
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Remaining counts is passed by express-rate-limit headers (X-RateLimit-Remaining)
    // We could attach it manually if desired or rely on the headers on the client side.
    const remainingHits = res.getHeader('RateLimit-Remaining');

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Credentials required", remaining: remainingHits });
    }

    const admin = await SuperAdmin.findOne({ username });
    if (!admin) {
      return res.status(400).json({ success: false, message: "Invalid credentials", remaining: remainingHits });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid credentials", remaining: remainingHits });
    }

    const token = jwt.sign({ id: admin._id, isSuperAdmin: true }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    return res.json({ success: true, token, remaining: remainingHits });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Login failed", error: err.message });
  }
};

// 3. Get all users
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password -deletePassword");
    // Fallback date to today if missing (User requested this)
    const formattedUsers = users.map(u => {
      const uObj = u.toObject();
      if (!uObj.createdAt) uObj.createdAt = new Date();
      if (!uObj.updatedAt) uObj.updatedAt = new Date();
      if (!uObj.displayName) uObj.displayName = uObj.username;
      return uObj;
    });
    return res.json({ success: true, users: formattedUsers });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to fetch users", error: err.message });
  }
};

// 4. Create User
exports.createUser = async (req, res) => {
  try {
    const { username, password, contactNumber } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password required" });
    }
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
        return res.status(400).json({ success: false, message: "Username already exists" });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      displayName: username,
      password: hashedPassword,
      deletePassword: hashedPassword,
      contactNumber: contactNumber || "919824650646",
    });

    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.deletePassword;
    return res.status(201).json({ success: true, message: "User created", user: userObj });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Create user failed", error: err.message });
  }
};

// 5. Rename User
exports.renameUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { displayName } = req.body;
    
    if (!displayName) {
       return res.status(400).json({ success: false, message: "New display name required" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.displayName = displayName;
    await user.save();

    return res.json({ success: true, message: "User renamed" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Rename failed", error: err.message });
  }
};

// 6. Toggle User Status
exports.toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.isActive = Boolean(isActive);
    await user.save();

    return res.json({ success: true, message: "Status updated" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Toggle failed", error: err.message });
  }
};

// 7. Delete User
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: "Super Admin password is required to delete" });
    }

    // Verify SuperAdmin password
    const superadminId = req.superAdmin.id;
    const superAdminAcc = await SuperAdmin.findById(superadminId);
    if (!superAdminAcc) return res.status(401).json({ success: false, message: "Authentication failure" });
    
    const isMatch = await bcrypt.compare(password, superAdminAcc.password);
    if (!isMatch) {
      return res.status(403).json({ success: false, message: "Incorrect password" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    await User.findByIdAndDelete(id);

    return res.json({ success: true, message: "User deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Delete failed", error: err.message });
  }
};
