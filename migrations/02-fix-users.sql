
ALTER TABLE users
MODIFY COLUMN role ENUM
('student', 'teacher', 'admin') NOT NULL DEFAULT 'student',
MODIFY COLUMN is_active BOOLEAN DEFAULT TRUE;

-- 2. Создание таблицы tests (если не существует)
CREATE TABLE
IF NOT EXISTS tests
(
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR
(255) NOT NULL,
  teacher_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY
(teacher_id) REFERENCES users
(id)
);

-- 3. Создание таблицы questions (если не существует)
CREATE TABLE
IF NOT EXISTS questions
(
  id INT AUTO_INCREMENT PRIMARY KEY,
  test_id INT NOT NULL,
  text TEXT NOT NULL,
  FOREIGN KEY
(test_id) REFERENCES tests
(id) ON
DELETE CASCADE
);

-- 4. Создание таблицы answers (если не существует)
CREATE TABLE
IF NOT EXISTS answers
(
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL,
  text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  FOREIGN KEY
(question_id) REFERENCES questions
(id) ON
DELETE CASCADE
);

-- 5. Активация всех преподавателей и админов (если нужно)
UPDATE users SET is_active = TRUE WHERE role IN ('teacher', 'admin');

-- 6. Пример добавления тестовых данных (можно закомментировать)
INSERT IGNORE
INTO users
(username, password, role, is_active) VALUES
('admin', '$2b$10$KJ3V8QZz7Ua7V1j2X5uY.9VZJQ0hLb8W8c7rYd6Xv3kLmN1hW6bK2', 'admin', 1),
('teacher1', '$2b$10$L9J7QZz7Ua7V1j2X5uY.9VZJQ0hLb8W8c7rYd6Xv3kLmN1hW6bK2', 'teacher', 1),
('student1', '$2b$10$M0K8RZz7Ua7V1j2X5uY.9VZJQ0hLb8W8c7rYd6Xv3kLmN1hW6bK2', 'student', 1);

-- Проверочные запросы (можно удалить после тестирования)
SELECT *
FROM users;
SHOW TABLES;
-- Для пользователей с незахешированными паролями:
UPDATE users SET password = 
  CONCAT('$2a$10$', SUBSTRING(SHA2(CONCAT(password, RAND()), 256), 1, 53))
WHERE password NOT LIKE '$2a$%' AND password NOT LIKE '$2b$%';
-- Проверка создания теста
INSERT INTO tests
    (title, teacher_id)
VALUES
    ('Первый тест', 20);
-- teacher1

-- Добавление вопроса
INSERT INTO questions
    (test_id, text)
VALUES
    (1, 'Сколько будет 2+2?');

-- Добавление ответов
INSERT INTO answers
    (question_id, text, is_correct)
VALUES
    (1, '3', FALSE),
    (1, '4', TRUE),
    (1, '5', FALSE);