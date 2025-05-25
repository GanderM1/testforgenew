const mysql = require("mysql2/promise");
require("dotenv").config();

// Конфигурация подключения
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
