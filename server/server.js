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
  // Конфигурация для Railway
  if (
    process.env.RAILWAY_ENVIRONMENT === "production" ||
    process.env.MYSQLHOST
  ) {
    return {
      host: process.env.MYSQLHOST || "mysql.railway.internal",
      user: process.env.MYSQLUSER || "root",
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE || "railway",
      port: parseInt(process.env.MYSQLPORT) || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      connectTimeout: 10000,
      ssl:
        process.env.MYSQL_SSL === "true" ? { rejectUnauthorized: false } : null,
      multipleStatements: true,
    };
  }

  // Локальная разработка
  return {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "testforge",
    port: parseInt(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 10000,
  };
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  cors({
    origin: ["http://localhost:3000", "https://testforge1.up.railway.app"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ======================
// Миграции базы данных
// ======================
const migrations = [
  {
    name: "01-initial-schema.sql",
    sql: `
      
      CREATE TABLE IF NOT EXISTS user_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
     
      INSERT IGNORE INTO user_groups (id, name) VALUES 
        (1, 'Группа К'),
        (2, 'Группа З');
      
      
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('student', 'teacher', 'admin') NOT NULL DEFAULT 'student',
        group_id INT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE SET NULL,
        UNIQUE KEY unique_user_per_group (username, group_id)
      ) ENGINE=InnoDB;
      
      
      CREATE TABLE IF NOT EXISTS tests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        author_id INT NOT NULL,
        available_to_all BOOLEAN DEFAULT FALSE,
        passing_score INT DEFAULT NULL,
        can_retake BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
      
      
      CREATE TABLE IF NOT EXISTS questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        test_id INT NOT NULL,
        text TEXT NOT NULL,
        question_type ENUM('single', 'multiple', 'text') NOT NULL DEFAULT 'single',
        correct_text_answer TEXT NULL,
        FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
      
      
      CREATE TABLE IF NOT EXISTS answers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        question_id INT NOT NULL,
        text TEXT NOT NULL,
        is_correct BOOLEAN NOT NULL DEFAULT FALSE,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
      
      
      CREATE TABLE IF NOT EXISTS test_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        test_id INT NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
      
      
      CREATE TABLE IF NOT EXISTS student_answers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        attempt_id INT NOT NULL,
        question_id INT NOT NULL,
        answer_id INT NULL,
        text_answer TEXT NULL,
        answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
        FOREIGN KEY (answer_id) REFERENCES answers(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
      
      
      CREATE TABLE IF NOT EXISTS test_results (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        test_id INT NOT NULL,
        score INT NOT NULL,
        total_questions INT NOT NULL,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
      
      
      CREATE TABLE IF NOT EXISTS test_groups (
        test_id INT NOT NULL,
        group_id INT NOT NULL,
        PRIMARY KEY (test_id, group_id),
        FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;

      
CREATE TABLE IF NOT EXISTS test_exclusions (
  test_id INT NOT NULL,
  group_id INT NOT NULL,
  PRIMARY KEY (test_id, group_id),
  FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `,
  },
];

async function runMigrations() {
  const connection = await db.getConnection();
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");

    // Создаем таблицу для отслеживания миграций
    await connection.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    const [executedMigrations] = await connection.query(
      "SELECT name FROM migrations"
    );
    const executedNames = executedMigrations.map((m) => m.name);

    for (const migration of migrations) {
      if (!executedNames.includes(migration.name)) {
        console.log(`🛠 Выполнение миграции: ${migration.name}`);

        // Разделяем SQL на отдельные запросы
        const statements = migration.sql
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const statement of statements) {
          try {
            await connection.query(statement);
          } catch (err) {
            console.error(`❌ Ошибка в запросе:`, err.message);
            console.error("Запрос:", statement);
            throw err;
          }
        }

        await connection.query("INSERT INTO migrations (name) VALUES (?)", [
          migration.name,
        ]);
        console.log(`✅ Миграция ${migration.name} успешно выполнена`);
      }
    }

    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  } catch (err) {
    console.error("❌ Ошибка миграций:", err);
    throw err;
  } finally {
    connection.release();
  }
}

// ======================
// Проверка подключения к БД
// ======================
const checkDBConnection = async () => {
  console.log("Попытка подключения с параметрами:", dbConfig);

  let conn;
  try {
    conn = await mysql.createConnection(dbConfig); // Используем основную конфигурацию
    await conn.query("SELECT 1");
    console.log("✅ Проверка подключения успешна");
  } catch (err) {
    console.error("❌ Критическая ошибка подключения:", {
      message: err.message,
      code: err.code,
      config: dbConfig,
      stack: err.stack,
    });
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
};

const checkTables = async () => {
  try {
    await runMigrations();
    console.log("✅ Все таблицы успешно проверены/созданы");
  } catch (err) {
    console.error("❌ Критическая ошибка инициализации БД:", err);
    throw err;
  }
};

// ======================
// Middleware авторизации
// ======================
const authenticate = async (req, res, next) => {
  // Разрешаем OPTIONS запросы для CORS
  if (req.method === "OPTIONS") return next();

  // Публичные маршруты (полный доступ)
  const publicRoutes = [
    "/api/auth",
    "/api/auth/login",
    "/api/auth/register",
    "/api/health",
  ];

  // Частично публичные маршруты (GET доступен всем, остальные методы требуют авторизации)
  const partiallyPublicRoutes = [{ path: "/api/groups", methods: ["GET"] }];

  // Проверяем полные публичные маршруты
  if (publicRoutes.some((route) => req.path.startsWith(route))) {
    return next();
  }

  // Проверяем частично публичные маршруты
  const isPartiallyPublic = partiallyPublicRoutes.some((route) => {
    const pathMatch = req.path.startsWith(route.path);
    const methodMatch = route.methods.includes(req.method);
    return pathMatch && methodMatch;
  });

  if (isPartiallyPublic) {
    return next();
  }

  // Для всех остальных маршрутов требуем авторизацию
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
      return res
        .status(400)
        .json({ error: "Имя фамилия и пароль обязательны" });
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
        error:
          "Имя и фамилия могут содержать только кириллицу, пробелы и дефисы",
      });
    }

    if (capitalLetters.length < 2) {
      return res.status(400).json({
        error: "Ваше имя должно содержать такой продок (Имя Фимилия)",
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
        error:
          "Пользователь с таким именем и фамилий уже зарегистрирован в этой группе",
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

app.get("/api/students/my-stats", async (req, res) => {
  try {
    // Проверяем, что запрашивает студент
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Доступ только для студентов" });
    }

    const userId = req.user.id;

    // Запрос для получения статистики по пройденным тестам
    const [stats] = await db.query(
      `
      SELECT 
        t.id AS test_id,
        t.title AS test_title,
        u.username AS author,
        COUNT(tr.id) AS attempts,
        MAX(tr.score) AS best_score,
        MIN(tr.score) AS worst_score,
        AVG(tr.score) AS average_score,
        MAX(tr.completed_at) AS last_attempt
      FROM test_results tr
      JOIN tests t ON tr.test_id = t.id
      JOIN users u ON t.author_id = u.id
      WHERE tr.user_id = ?
      GROUP BY t.id, t.title, u.username
      ORDER BY last_attempt DESC
    `,
      [userId]
    );

    // Форматируем результаты
    const formattedStats = stats.map((stat) => ({
      test_id: stat.test_id,
      test_title: stat.test_title,
      author: stat.author,
      attempts: stat.attempts,
      best_score: Math.round(stat.best_score * 100),
      worst_score: Math.round(stat.worst_score * 100),
      average_score: Math.round(stat.average_score * 100),
      last_attempt: stat.last_attempt,
    }));

    res.json(formattedStats);
  } catch (err) {
    console.error("Ошибка получения статистики студента:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
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
(async () => {
  try {
    await checkDBConnection();
    await checkTables();
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
  } catch (err) {
    console.error("❌ Не удалось запустить сервер:", err);
    process.exit(1);
  }
})();
