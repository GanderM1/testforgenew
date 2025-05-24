const express = require("express");
const router = express.Router();
const db = require("../models/db");
const authenticate = require("../middleware/authenticate");

router.get("/", authenticate, async (req, res) => {
  try {
    const [groups] = await db.query("SELECT id, name FROM user_groups");
    res.json(groups);
  } catch (err) {
    console.error("Ошибка при загрузке групп:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

module.exports = router;
