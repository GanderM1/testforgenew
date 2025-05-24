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
const dbConfig = {
  host: process.env.MYSQLHOST || "mysql.railway.internal",
  user: process.env.MYSQLUSER || "root",
  password: process.env.MYSQLPASSWORD || "RQktuLMxfeDeonoGKqTqykWLpPcBUnlo",
  database: process.env.MYSQLDATABASE || "railway",
  port: parseInt(process.env.MYSQLPORT) || 3306,
  ssl:
    process.env.NODE_ENV === "production"
      ? {
          rejectUnauthorized: false,
          minVersion: "TLSv1.2",
        }
      : null,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 10000,
  flags: ["-FOUND_ROWS"],
};

console.log("Актуальная конфигурация БД:", {
  ...dbConfig,
  password: "***", // Не логируем реальный пароль
});
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
      -- 1. Сначала создаем таблицу групп (нет зависимостей)
      CREATE TABLE IF NOT EXISTS user_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- 2. Добавляем обязательные группы (если их нет)
      INSERT IGNORE INTO user_groups (id, name) VALUES 
        (1, 'Группа К'),
        (2, 'Группа З');
      
      -- 3. Таблица пользователей (зависит от user_groups)
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
      
      -- 4. Таблица тестов (зависит от users)
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
      
      -- 5. Таблица вопросов (зависит от tests)
      CREATE TABLE IF NOT EXISTS questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        test_id INT NOT NULL,
        text TEXT NOT NULL,
        question_type ENUM('single', 'multiple', 'text') NOT NULL DEFAULT 'single',
        correct_text_answer TEXT NULL,
        FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
      
      -- 6. Таблица ответов (зависит от questions)
      CREATE TABLE IF NOT EXISTS answers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        question_id INT NOT NULL,
        text TEXT NOT NULL,
        is_correct BOOLEAN NOT NULL DEFAULT FALSE,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
      
      -- 7. Таблица попыток (зависит от users и tests)
      CREATE TABLE IF NOT EXISTS test_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        test_id INT NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
      
      -- 8. Таблица ответов студентов (зависит от test_attempts, questions, answers)
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
      
      -- 9. Таблица результатов тестов (зависит от users и tests)
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
      
      -- 10. Таблица связи тестов и групп (зависит от tests и user_groups)
      CREATE TABLE IF NOT EXISTS test_groups (
        test_id INT NOT NULL,
        group_id INT NOT NULL,
        PRIMARY KEY (test_id, group_id),
        FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;

      -- 11. Таблица исключений тестов для групп
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
    console.log("🛠 Начало выполнения миграций...");

    // Отключаем проверку внешних ключей для миграций
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");

    // Создаем таблицу для отслеживания миграций, если её нет
    await connection.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // Получаем список выполненных миграций
    const [executedMigrations] = await connection.query(
      "SELECT name FROM migrations"
    );
    const executedNames = new Set(executedMigrations.map((m) => m.name));

    // Выполняем только новые миграции
    for (const migration of migrations) {
      if (!executedNames.has(migration.name)) {
        console.log(`🔨 Выполняю миграцию: ${migration.name}`);

        try {
          // Разбиваем SQL на отдельные запросы
          const statements = migration.sql
            .split(";")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

          for (const statement of statements) {
            if (statement) {
              await connection.query(statement);
            }
          }

          // Фиксируем выполнение миграции
          await connection.query("INSERT INTO migrations (name) VALUES (?)", [
            migration.name,
          ]);
          console.log(`✅ Миграция ${migration.name} успешно выполнена`);
        } catch (err) {
          console.error(`❌ Ошибка в миграции ${migration.name}:`, err);
          throw err;
        }
      }
    }

    // Включаем проверку внешних ключей обратно
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    console.log("🎉 Все миграции успешно выполнены");
  } catch (err) {
    console.error("💥 Критическая ошибка при выполнении миграций:", err);
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

async function debugDatabase() {
  const conn = await db.getConnection();
  try {
    // Проверяем существующие таблицы
    const [tables] = await conn.query(
      `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = ?
    `,
      [dbConfig.database]
    );
    console.log(
      "Существующие таблицы:",
      tables.map((t) => t.table_name)
    );

    // Проверяем таблицу migrations
    const [migs] = await conn.query("SELECT * FROM migrations");
    console.log("Выполненные миграции:", migs);
  } finally {
    conn.release();
  }
}

async function checkTables() {
  try {
    console.log("🛠 Проверка и создание таблиц...");
    await runMigrations();

    // Проверяем, что основные таблицы существуют
    const [tables] = await db.query(
      `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = ? 
        AND table_name IN ('users', 'tests', 'questions', 'answers')
    `,
      [dbConfig.database]
    );

    const missingTables = ["users", "tests", "questions", "answers"].filter(
      (t) => !tables.some((x) => x.table_name === t)
    );

    if (missingTables.length > 0) {
      throw new Error(`Отсутствуют таблицы: ${missingTables.join(", ")}`);
    }

    console.log("✅ Все таблицы существуют");
  } catch (err) {
    console.error("❌ Критическая ошибка инициализации БД:", err);
    throw err;
  }
}

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
async function startServer() {
  try {
    // 1. Проверяем подключение к БД
    await checkDBConnection();
    await debugDatabase();
    // 2. Создаем таблицы через миграции
    await checkTables();

    // 3. Запускаем сервер
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
}

// Запускаем приложение
startServer();
