const mysql = require("mysql2/promise");
require("dotenv").config();

// Конфигурация подключения
const dbConfig = {
  host: process.env.MYSQLHOST || "mysql.railway.internal",
  user: process.env.MYSQLUSER || "root",
  password: process.env.MYSQLPASSWORD || "mhCdebLvqfawRlcserQlwxboFOeRdOWX",
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

// Создаем пул соединений
const pool = mysql.createPool(dbConfig);

// Проверка подключения при старте
async function checkConnection() {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log("✅ Успешное подключение к MySQL");

    // Проверяем существование таблиц
    await checkTables(conn);
  } catch (err) {
    console.error("❌ Ошибка подключения к MySQL:", {
      message: err.message,
      code: err.code,
      host: dbConfig.host,
      database: dbConfig.database,
    });
    process.exit(1);
  } finally {
    if (conn) conn.release();
  }
}

// Проверка существования таблиц
async function checkTables(connection) {
  const requiredTables = ["users", "tests", "questions", "answers"];
  try {
    for (const table of requiredTables) {
      const [rows] = await connection.query(`SHOW TABLES LIKE '${table}'`);
      if (rows.length === 0) {
        console.warn(`⚠️ Таблица ${table} не найдена`);
      }
    }
  } catch (err) {
    console.error("Ошибка проверки таблиц:", err);
  }
}

// Проверяем подключение при старте
checkConnection();

// Обработка завершения приложения
process.on("SIGINT", async () => {
  try {
    await pool.end();
    console.log("Пул соединений MySQL закрыт");
    process.exit(0);
  } catch (err) {
    console.error("Ошибка при закрытии пула соединений:", err);
    process.exit(1);
  }
});

module.exports = pool;
