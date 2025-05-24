const mysql = require("mysql2/promise");
require("dotenv").config();

console.log("DB config:", {
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD ? "***" : "(empty)",
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
});

const isRailway = process.env.MYSQLHOST === "mysql.railway.internal";

const dbConfig = {
  host: process.env.MYSQLHOST || "",
  user: process.env.MYSQLUSER || "root",
  password: process.env.MYSQLPASSWORD || "",
  database: process.env.MYSQLDATABASE || "",
  port: Number(process.env.MYSQLPORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
  ssl: isRailway
    ? {
        rejectUnauthorized: false,
        minVersion: "TLSv1.2",
      }
    : undefined,
};

const pool = mysql.createPool(dbConfig);

async function checkConnection() {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log("✅ Успешное подключение к MySQL:", {
      host: dbConfig.host,
      database: dbConfig.database,
    });

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

async function checkTables(connection) {
  const requiredTables = ["users", "tests", "questions", "answers"];
  try {
    for (const table of requiredTables) {
      const [rows] = await connection.query(`SHOW TABLES LIKE ?`, [table]);
      if (rows.length === 0) {
        console.warn(`⚠️ Таблица ${table} не найдена`);
      }
    }
  } catch (err) {
    console.error("Ошибка проверки таблиц:", err);
  }
}

checkConnection();

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
