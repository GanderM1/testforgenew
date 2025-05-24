-- Таблица попыток прохождения теста
CREATE TABLE
IF NOT EXISTS test_attempts
(
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  test_id INT NOT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY
(student_id) REFERENCES users
(id),
  FOREIGN KEY
(test_id) REFERENCES tests
(id)
);

-- Таблица ответов студентов
CREATE TABLE
IF NOT EXISTS student_answers
(
  id INT AUTO_INCREMENT PRIMARY KEY,
  attempt_id INT NOT NULL,
  question_id INT NOT NULL,
  answer_id INT NOT NULL,
  FOREIGN KEY
(attempt_id) REFERENCES test_attempts
(id),
  FOREIGN KEY
(question_id) REFERENCES questions
(id),
  FOREIGN KEY
(answer_id) REFERENCES answers
(id)
);