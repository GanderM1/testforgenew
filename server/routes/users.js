const express = require("express");
const bcrypt = require("bcrypt");

module.exports = (db) => {
  const router = express.Router();

  // Проверка роли
  const requireRole = (role) => (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: "Доступ запрещён" });
    }
    next();
  };

  // 🔐 Получить всех пользователей (только админ)
  router.get("/", requireRole("admin"), async (req, res) => {
    console.log("Запрос на получение пользователей"); // Лог до запроса
    try {
      const [users] = await db.query(
        `SELECT 
       users.id, 
       users.username, 
       users.role, 
       users.is_active, 
       groups.name AS group_name 
     FROM users 
     LEFT JOIN groups ON users.group_id = groups.id`
      );
      console.log("Пользователи получены:", users); // Лог после запроса
      res.json(users);
    } catch (err) {
      console.error("Ошибка получения пользователей:", err);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });

  // ➕ Создать пользователя (только админ)
  router.post("/", requireRole("admin"), async (req, res) => {
    try {
      const { username, password, groupId } = req.body;

      if (!username || !password || !groupId) {
        return res
          .status(400)
          .json({ error: "username, password и groupId обязательны" });
      }

      // Если группа указана, проверяем количество студентов в группе
      const [countRows] = await db.query(
        "SELECT COUNT(*) AS count FROM users WHERE group_id = ? AND role = 'student'",
        [groupId]
      );
      const count = countRows[0].count;

      if (count >= 25) {
        return res
          .status(400)
          .json({ error: "В этой группе уже 25 студентов" });
      }

      const hash = await bcrypt.hash(password, 10);
      await db.query(
        "INSERT INTO users (username, password, role, group_id, is_active) VALUES (?, ?, 'student', ?, 1)",
        [username, hash, groupId]
      );

      res.status(201).json({ message: "Пользователь создан" });
    } catch (err) {
      console.error("Ошибка создания пользователя:", err);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await db.query("DELETE FROM users WHERE id = ?", [id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Пользователь не найден" });
      }
      res.status(200).json({ message: "Пользователь удален" });
    } catch (error) {
      console.error("Ошибка при удалении пользователя:", error);
      res.status(500).json({ error: "Ошибка на сервере" });
    }
  });

  router.get("/user_groups", requireRole("admin"), async (req, res) => {
    try {
      // Используем экранирование имени таблицы groups
      const [user_groups] = await db.query(
        "SELECT id, name FROM `user_groups`"
      );
      res.json(user_groups);
    } catch (err) {
      console.error("Ошибка получения групп:", err);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });

  // 👤 Получить своего пользователя
  router.get("/me", async (req, res) => {
    res.json(req.user);
  });

  return router;
};
