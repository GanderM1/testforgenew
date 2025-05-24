const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");

module.exports = (db) => {
  const router = express.Router();

  // Вход пользователя
  router.post(
    "/login",
    [
      body("username")
        .trim()
        .notEmpty()
        .withMessage("Имя пользователя обязательно"),
      body("password").notEmpty().withMessage("Пароль обязателен"),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, password } = req.body;

      try {
        const [users] = await db.query(
          "SELECT id, username, password, role, group_id, is_active FROM users WHERE username = ?",
          [username]
        );

        const user = users[0];

        if (!user || !user.is_active) {
          return res.status(401).json({ error: "Неверные учетные данные" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          return res.status(401).json({ error: "Неверные учетные данные" });
        }

        const token = jwt.sign(
          {
            userId: user.id,
            username: user.username,
            role: user.role,
          },
          process.env.JWT_SECRET,
          { expiresIn: "1h" }
        );

        res.json({
          token,
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            group_id: user.group_id,
          },
        });
      } catch (err) {
        console.error("Ошибка входа:", err);
        res.status(500).json({ error: "Внутренняя ошибка сервера" });
      }
    }
  );

  // Регистрация нового студента
  router.post(
    "/register",
    [
      body("username")
        .trim()
        .notEmpty()
        .withMessage("Имя пользователя обязательно"),
      body("password").notEmpty().withMessage("Пароль обязателен"),
      body("group_id")
        .notEmpty()
        .withMessage("Группа обязательна")
        .isInt()
        .withMessage("ID группы должен быть числом"),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, password, group_id } = req.body;
      const role = "student"; // задаём роль вручную

      try {
        const [existingUsers] = await db.query(
          "SELECT * FROM users WHERE username = ? AND group_id = ?",
          [username, group_id]
        );

        if (existingUsers.length > 0) {
          return res.status(400).json({ error: "Имя пользователя уже занято" });
        }

        const [groups] = await db.query(
          "SELECT id FROM user_groups WHERE id = ?",
          [group_id]
        );
        if (groups.length === 0) {
          return res
            .status(400)
            .json({ error: "Указанная группа не существует" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const [result] = await db.query(
          "INSERT INTO users (username, password, role, group_id) VALUES (?, ?, ?, ?)",
          [username, hashedPassword, role, group_id]
        );

        res.status(201).json({
          message: "Студент успешно зарегистрирован",
          userId: result.insertId,
        });
      } catch (err) {
        console.error("Ошибка регистрации:", err);
        res.status(500).json({
          error: "Ошибка при регистрации пользователя",
          details:
            process.env.NODE_ENV === "development" ? err.message : undefined,
        });
      }
    }
  );

  return router;
};
