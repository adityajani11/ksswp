const router = require("express").Router();
const Contact = require("../models/Contact");
const auth = require("../middleware/auth");

router.post("/", auth, async (req, res) => {
  const contact = await Contact.create({
    ...req.body,
    createdBy: req.user.id,
  });
  res.json(contact);
});

router.get("/", auth, async (req, res) => {
  const contacts = await Contact.find({ createdBy: req.user.id });
  res.json(contacts);
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    const contact = await Contact.findOne({
      _id: id,
      createdBy: req.user.id,
    });

    if (!contact) {
      return res.status(404).json({
        message: "Contact not found",
      });
    }

    await contact.deleteOne();

    res.json({
      success: true,
      message: "Contact deleted successfully",
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to delete contact",
      error: err.message,
    });
  }
});

module.exports = router;
