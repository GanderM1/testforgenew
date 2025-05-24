const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "/.env") });

const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const testsRouter = require("./routes/tests");

const app = express();
const PORT = process.env.PORT || 3000;

// ======================
// Конфигурация базы данных
// ======================
const getDbConfig = () => {
  // Для Railway
  if (process.env.MYSQLHOST) {
    return {
      host: process.env.MYSQLHOST || "mysql.railway.internal",
      user: process.env.MYSQLUSER || "root",
      password: process.env.MYSQLPASSWORD || "KUCzLkYBMfQImvqgGPBRxHhZOdvVKhxf",
      database: process.env.MYSQLDATABASE || "railway",
      port: process.env.MYSQLPORT || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      connectTimeout: 10000,
      socketPath: process.env.NODE_ENV === "production" ? null : undefined,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : null,
      // Явно указываем тип хоста
      uri: process.env.MYSQL_URL,
      multipleStatements: true,
    };
  }

  // Для локальной разработки
  // return {
  //   host: process.env.DB_HOST || "localhost",
  //   user: process.env.DB_USER || "root",
  //   password: process.env.DB_PASSWORD || "",
  //   database: process.env.DB_NAME || "testforge",
  //   port: process.env.DB_PORT || 3306,
  //   waitForConnections: true,
  //   connectionLimit: 10,
  //   connectTimeout: 10000,
  // };
};

const dbConfig = getDbConfig();
const db = mysql.createPool(dbConfig);

// Логирование конфигурации
console.log("🔧 Конфигурация сервера:", {
  environment: process.env.NODE_ENV || "development",
  port: PORT,
  database: {
    host: dbConfig.host,
    name: dbConfig.database,
    port: dbConfig.port,
  },
});

// ======================
// Middleware
// ======================
app.use(helmet());
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL
        : "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.static(path.join(__dirname, "public")));

// ======================
// Проверка подключения к БД
// ======================
const checkDBConnection = async () => {
  let conn;
  try {
    // Сначала подключаемся без указания базы
    conn = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port,
    });

    console.log("✅ Успешное подключение к MySQL серверу");

    // Создаем базу если не существует
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
    await conn.query(`USE \`${dbConfig.database}\``);

    console.log(`🛠 Используем базу данных: ${dbConfig.database}`);

    await checkTables();
  } catch (err) {
    console.error("❌ Ошибка подключения к MySQL:", {
      message: err.message,
      code: err.code,
      host: dbConfig.host,
    });
    process.exit(1);
  } finally {
    if (conn) conn.end();
  }
};

const checkTables = async () => {
  const requiredTables = [
    "users",
    "user_groups",
    "tests",
    "questions",
    "answers",
    "test_results",
  ];
  const connection = await db.getConnection();

  try {
    // Проверяем существование таблиц
    const missingTables = [];
    for (const table of requiredTables) {
      const [rows] = await connection.query(`SHOW TABLES LIKE '${table}'`);
      if (rows.length === 0) {
        missingTables.push(table);
      }
    }

    // Если отсутствуют таблицы, выполняем скрипт инициализации
    if (missingTables.length > 0) {
      console.log(
        "🛠 Обнаружены отсутствующие таблицы:",
        missingTables.join(", ")
      );

      const initScript = fs.readFileSync(
        path.join(__dirname, "db-init.sql"),
        "utf-8"
      );

      // Выполняем скрипт построчно
      const statements = initScript.split(";").filter((s) => s.trim());
      for (const statement of statements) {
        try {
          await connection.query(statement);
        } catch (err) {
          console.error("Ошибка выполнения SQL:", err.message);
        }
      }

      console.log("✅ База данных успешно инициализирована");
    } else {
      console.log("✅ Все таблицы существуют");
    }
  } finally {
    connection.release();
  }
};

// ======================
// Middleware авторизации
// ======================
const authenticate = async (req, res, next) => {
  const publicRoutes = [
    "/api/auth",
    "/api/auth/login",
    "/api/auth/register",
    "/api/health",
  ];

  if (publicRoutes.some((route) => req.path.startsWith(route))) {
    return next();
  }

  try {
    const token =
      req.cookies?.token || req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Требуется авторизация" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [users] = await db.query(
      `SELECT id, username, role, group_id, is_active FROM users WHERE id = ?`,
      [decoded.userId]
    );

    if (!users[0]?.is_active) {
      return res
        .status(401)
        .json({ error: "Пользователь не найден или деактивирован" });
    }

    req.user = users[0];
    next();
  } catch (err) {
    console.error("Ошибка аутентификации:", err.message);
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Недействительный токен" });
    }
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Токен истек" });
    }
    res.status(500).json({ error: "Ошибка сервера при аутентификации" });
  }
};

// ======================
// Роуты API
// ======================

// Health check
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      database: dbConfig.database,
      dbStatus: "connected",
    });
  } catch (err) {
    res.status(500).json({
      status: "ERROR",
      error: err.message,
      dbStatus: "disconnected",
    });
  }
});

// Auth routes
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Логин и пароль обязательны" });
    }

    // Запрос к базе данных
    const [users] = await db.query(
      "SELECT id, username, password, role, group_id, is_active FROM users WHERE username = ?",
      [username]
    );

    if (users.length === 0) {
      console.log("Пользователь не найден в базе данных:", username);
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }

    const user = users[0];
    console.log("Пользователь найден в базе данных:", user.username);

    // Проверка активности пользователя и совпадения паролей
    if (!user.is_active) {
      return res.status(401).json({ error: "Пользователь заблокирован" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      console.log("Неверный пароль для пользователя:", username);
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }

    // Генерация JWT
    console.log("Создание JWT для пользователя:", user.username);
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    // Отправка токена и данных пользователя
    res
      .cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 8 * 60 * 60 * 1000, // 8 часов
      })
      .json({
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          group_id: user.group_id,
        },
      });
  } catch (error) {
    console.error("Детали ошибки входа:", {
      error: error.message,
      stack: error.stack,
      body: req.body,
    });

    res.status(500).json({
      error: "login_failed",
      message: "Не удалось войти. Попробуйте позже.",
    });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    let { username, password, role = "student", group_id } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "ФИ и пароль обязательны" });
    }

    // Приведение ФИ к формату: каждое слово с заглавной
    const normalizeFullName = (name) =>
      name
        .toLowerCase()
        .trim()
        .replace(/(?:^|\s|-)[а-яё]/g, (letter) => letter.toUpperCase());

    username = normalizeFullName(username);

    // Валидация символов
    const validUsernameRegex = /^[А-Яа-яЁё\- ]+$/;
    const capitalLetters = username.match(/[А-ЯЁ]/g) || [];

    if (!validUsernameRegex.test(username)) {
      return res.status(400).json({
        error: "ФИ может содержать только кириллицу, пробелы и дефисы",
      });
    }

    if (capitalLetters.length < 2) {
      return res.status(400).json({
        error:
          "ФИ должно содержать как минимум две заглавные буквы (например, имя и фамилия)",
      });
    }

    // Проверка роли
    if (!["student", "teacher", "admin"].includes(role)) {
      return res.status(400).json({ error: "Недопустимая роль пользователя" });
    }

    if (role === "student" && !group_id) {
      return res.status(400).json({
        error: "Для студента необходимо указать группу",
      });
    }

    // Проверка существования группы
    if (group_id) {
      const [group] = await connection.query(
        "SELECT id FROM user_groups WHERE id = ?",
        [group_id]
      );
      if (group.length === 0) {
        return res.status(400).json({
          error: "Указанная группа не существует",
        });
      }
    }

    // Проверка уникальности по имени и группе
    const [existing] = await connection.query(
      "SELECT id FROM users WHERE username = ? AND group_id <=> ?",
      [username, role === "student" ? group_id : null]
    );
    if (existing.length > 0) {
      return res.status(400).json({
        error: "Пользователь с таким ФИ уже зарегистрирован в этой группе",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const [result] = await connection.query(
      "INSERT INTO users (username, password, role, group_id, is_active) VALUES (?, ?, ?, ?, 1)",
      [username, hashedPassword, role, role === "student" ? group_id : null]
    );

    await connection.commit();

    res.status(201).json({
      message: "Пользователь успешно зарегистрирован",
      userId: result.insertId,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Ошибка регистрации:", error);
    res.status(500).json({
      error: "Ошибка сервера",
      ...(process.env.NODE_ENV === "development" && { details: error.message }),
    });
  } finally {
    connection.release();
  }
});

app.get("/api/users/:id", authenticate, async (req, res) => {
  try {
    const userId = req.params.id;

    // Проверка прав доступа
    if (req.user.role !== "admin" && req.user.id !== parseInt(userId)) {
      return res.status(403).json({ error: "Доступ запрещён" });
    }

    const [users] = await db.query(
      `SELECT id, username, role, group_id 
       FROM users WHERE id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const user = users[0];

    // Добавляем информацию о группе, если есть
    if (user.group_id) {
      const [groups] = await db.query(
        "SELECT id, name FROM user_groups WHERE id = ?",
        [user.group_id]
      );
      user.group = groups[0];
    }

    res.json(user);
  } catch (err) {
    console.error("Ошибка получения пользователя:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.use("/api/tests", authenticate, testsRouter);

// ======================
// Защищенные роуты
// ======================
app.use(authenticate);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/api/profile", (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/users", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Доступ запрещён" });
    }

    const [users] = await db.query(`
      SELECT u.id, u.username, u.role, g.name as group_name, u.is_active 
      FROM users u
      LEFT JOIN user_groups g ON u.group_id = g.id
    `);
    res.json(users);
  } catch (err) {
    console.error("Ошибка получения пользователей:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Доступ запрещён" });
    }

    const userId = req.params.id;
    const [rows] = await db.query("SELECT id FROM users WHERE id = ?", [
      userId,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    await db.query("DELETE FROM users WHERE id = ?", [userId]);
    res.json({ message: "Пользователь успешно удалён" });
  } catch (err) {
    console.error("Ошибка удаления пользователя:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.get("/api/groups", async (req, res) => {
  try {
    const [groups] = await db.query("SELECT id, name FROM user_groups");
    res.json(groups);
  } catch (err) {
    console.error("Ошибка получения групп:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ======================
// Группы (добавить перед запуском сервера)
// ======================

// Создание группы
app.post("/api/groups", authenticate, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Доступ запрещён" });
  }

  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Название группы обязательно" });
    }

    const [result] = await db.query(
      "INSERT INTO user_groups (name) VALUES (?)",
      [name]
    );

    res.status(201).json({
      id: result.insertId,
      name,
      message: "Группа успешно создана",
    });
  } catch (err) {
    console.error("Ошибка создания группы:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Удаление группы
app.delete("/api/groups/:id", authenticate, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Доступ запрещён" });
  }

  try {
    const groupId = req.params.id;

    // Проверяем есть ли студенты в группе
    const [students] = await db.query(
      "SELECT id FROM users WHERE group_id = ? LIMIT 1",
      [groupId]
    );

    if (students.length > 0) {
      return res.status(400).json({
        error: "Нельзя удалить группу с привязанными студентами",
      });
    }

    const [result] = await db.query("DELETE FROM user_groups WHERE id = ?", [
      groupId,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Группа не найдена" });
    }

    res.json({ message: "Группа успешно удалена" });
  } catch (err) {
    console.error("Ошибка удаления группы:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ======================
// Запуск сервера
// ======================
checkDBConnection()
  .then(() => {
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Сервер запущен на порту ${PORT}`);
      console.log(`🔗 База данных: ${dbConfig.host}/${dbConfig.database}`);
    });

    process.on("SIGTERM", () => {
      console.log("🛑 Получен SIGTERM. Завершаем работу...");
      server.close(() => {
        db.end();
        process.exit(0);
      });
    });
  })
  .catch((err) => {
    console.error("❌ Не удалось запустить сервер:", err);
    process.exit(1);
  });
