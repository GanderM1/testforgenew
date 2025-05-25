document.addEventListener("DOMContentLoaded", function () {
  new StudentStatsManager();
  // Получаем данные пользователя из localStorage
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user")) || {};

  if (!token || !user.id) {
    redirectToLogin();
    return;
  }

  // Настройка заголовков для запросов
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // Основные элементы интерфейса
  const testListContainer = document.getElementById("test-list");
  const testViewContainer = document.getElementById("test-view");
  const backButton = document.createElement("button");
  backButton.textContent = "⇦ Назад к тестам";
  backButton.className = "back-button";
  backButton.addEventListener("click", showTestList);

  // Загружаем тесты при открытии страницы
  loadTests();

  // Функция загрузки списка тестов
  async function loadTests() {
    try {
      console.log("Начало загрузки тестов...");
      console.log("Текущий пользователь:", user); // Добавлено

      showLoader(testListContainer);
      const response = await fetch("/api/tests", { headers });

      if (!response.ok) throw new Error("Ошибка загрузки тестов");

      let tests = await response.json();
      console.log("Полученные тесты:", tests);

      // Фильтрация только для студентов
      if (user.role === "student") {
        console.log("Фильтрация тестов для студента");

        // Получаем данные пользователя с сервера для актуальной информации
        const userResponse = await fetch(`/api/users/${user.id}`, { headers });
        if (!userResponse.ok)
          throw new Error("Ошибка загрузки данных пользователя");

        const userData = await userResponse.json();
        console.log("Данные пользователя с сервера:", userData);

        tests = tests.filter((test) => {
          const isGeneral = !test.groups || test.groups.length === 0;
          const isForMyGroup = test.groups?.some(
            (g) => g.id === userData.group_id
          );
          console.log(
            `Тест ${test.id}: general=${isGeneral}, forMyGroup=${isForMyGroup}`
          );
          return isGeneral || isForMyGroup;
        });
      }

      console.log("Отфильтрованные тесты:", tests);
      renderTestCards(tests);
    } catch (error) {
      console.error("Ошибка загрузки тестов:", error);
      showError(testListContainer, "Нет доступных тестов");
    }
  }

  // В функции renderTestCards обновляем шаблон карточки теста
  function renderTestCards(tests) {
    testListContainer.innerHTML = "";

    if (!tests || tests.length === 0) {
      testListContainer.innerHTML = `
        <div class="no-tests-message">
          <p>Нет доступных тестов</p>
          ${
            this.currentUser?.role === "student"
              ? "<p>Возможно, у вас нет доступа или тесты не назначены вашей группе</p>"
              : ""
          }
        </div>
      `;
      return;
    }

    tests.forEach((test, index) => {
      const testCard = document.createElement("div");
      testCard.className = "test-card";
      testCard.style.animationDelay = `${index * 0.1}s`;

      testCard.innerHTML = `
          <h3>${test.title}</h3>
          ${
            test.description
              ? `<p class="test-description">${test.description}</p>`
              : ""
          }
          <div class="test-meta">
              ${
                test.author
                  ? `<span class="test-author">${test.author}</span>`
                  : ""
              }

            
          </div>
      `;

      testCard.addEventListener("click", (e) => {
        if (!e.target.closest("button")) {
          startTest(test.id);
        }
      });

      testListContainer.appendChild(testCard);
    });
  }

  // Загрузка и отображение конкретного теста
  async function startTest(testId) {
    try {
      showLoader(testViewContainer);

      // Проверка доступа для студентов
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      if (user.role === "student") {
        const accessResponse = await fetch(
          `/api/tests/${testId}/check-access`,
          {
            headers,
          }
        );

        if (!accessResponse.ok) {
          throw new Error("У вас нет доступа к этому тесту");
        }
      }

      const response = await fetch(`/api/tests/${testId}`, { headers });
      if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);

      const test = await response.json();
      renderTest(test);
      showTestView();
    } catch (error) {
      console.error("Ошибка:", error);
      showError(testViewContainer, error.message);
      showTestList();
    }
  }

  // Отображение конкретного теста (обновлено для поддержки разных типов)
  function renderTest(test) {
    testViewContainer.innerHTML = "";
    testViewContainer.appendChild(backButton);

    const testForm = document.createElement("form");
    testForm.id = "test-form";

    test.questions.forEach((question, index) => {
      const questionBlock = document.createElement("div");
      questionBlock.className = "question-block";

      questionBlock.innerHTML = `
        <div class="question-text">${index + 1}. ${question.text}</div>
        <div class="answers-container"></div>
      `;

      const answersContainer =
        questionBlock.querySelector(".answers-container");

      // Обработка разных типов вопросов
      if (question.question_type === "text") {
        answersContainer.innerHTML = `
  <textarea class="text-answer" name="question_${question.id}" 
            placeholder="Введите ответ" 
            required
            maxlength="200"></textarea>
  <div class="answer-hint">
  Ответ не больше (${question.correct_text_answer.length} симв.)
  </div>
`;
      } else {
        question.answers.forEach((answer) => {
          const answerElement = document.createElement("label");
          answerElement.className = "answer-option";

          const inputType =
            question.question_type === "multiple" ? "checkbox" : "radio";
          answerElement.innerHTML = `
            <input type="${inputType}" 
                   name="question_${question.id}" 
                   value="${answer.id}"
                   ${question.question_type === "single" ? "required" : ""}>
            <span>${answer.text}</span>
          `;
          answersContainer.appendChild(answerElement);
        });
      }

      testForm.appendChild(questionBlock);
    });

    const submitButton = document.createElement("button");
    submitButton.type = "submit";
    submitButton.className = "submit-button";
    submitButton.textContent = "Отправить ответы";
    testForm.appendChild(submitButton);

    testForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      await submitTest(test.id, collectAnswers(test.questions));
    });

    testViewContainer.appendChild(testForm);
  }

  // Сбор ответов (обновлено для поддержки разных типов)
  function collectAnswers(questions) {
    const answers = [];

    questions.forEach((question) => {
      const questionId = question.id;

      if (question.question_type === "text") {
        const textAnswer = document
          .querySelector(`textarea[name="question_${questionId}"]`)
          .value.trim();
        answers.push({
          questionId: questionId,
          textAnswer: textAnswer,
        });
      } else if (question.question_type === "multiple") {
        const checkedBoxes = document.querySelectorAll(
          `input[name="question_${questionId}"]:checked`
        );
        const answerIds = Array.from(checkedBoxes).map((cb) =>
          parseInt(cb.value)
        );
        answers.push({
          questionId: questionId,
          answerIds: answerIds,
        });
      } else {
        const selectedRadio = document.querySelector(
          `input[name="question_${questionId}"]:checked`
        );
        if (selectedRadio) {
          answers.push({
            questionId: questionId,
            answerId: parseInt(selectedRadio.value),
          });
        }
      }
    });

    return answers;
  }

  // Отправка ответов на тест (обновлено)
  async function submitTest(testId, answers) {
    try {
      const response = await fetch(`/api/tests/${testId}/submit`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ answers }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error || `HTTP error! status: ${response.status}`
        );
      }

      const result = await response.json();
      showTestResult(result);
    } catch (error) {
      console.error("Ошибка отправки теста:", error);
      alert(`Ошибка: ${error.message}`);
    }
  }

  // Показ результатов (без изменений)
  function showTestResult(result) {
    testViewContainer.innerHTML = "";
    testViewContainer.appendChild(backButton);

    const resultContainer = document.createElement("div");
    resultContainer.className = "result-container";

    const resultElement = document.createElement("div");
    resultElement.className = "test-result";

    let resultMessage = "";
    if (
      result.correctAnswers !== undefined &&
      result.totalQuestions !== undefined
    ) {
      const percentage = Math.round(
        (result.correctAnswers / result.totalQuestions) * 100
      );
      resultMessage = `
      <h3>Результат теста</h3>
      <div class="score">${result.correctAnswers} из ${
        result.totalQuestions
      } (${percentage}%)</div>
      <p class="result-comment">${getResultComment(percentage)}</p>
    `;
    } else {
      resultMessage = `<p>${result.message || "Тест завершен"}</p>`;
    }

    resultElement.innerHTML = resultMessage;
    resultContainer.appendChild(resultElement);
    testViewContainer.appendChild(resultContainer);
  }

  // Вспомогательные функции (без изменений)
  function showTestView() {
    testListContainer.style.display = "none";
    testViewContainer.style.display = "block";
  }

  function showTestList() {
    testViewContainer.style.display = "none";
    testListContainer.style.display = "grid";
    testListContainer.className = "test-grid";
    loadTests();
  }

  function showLoader(container) {
    container.innerHTML = '<div class="loader">Загрузка...</div>';
  }

  function showError(container, message) {
    container.innerHTML = `<div class="error-message">${message}</div>`;
  }

  function getResultComment(percentage) {
    if (percentage >= 90) return "Отличный результат!";
    if (percentage >= 70) return "Хороший результат!";
    if (percentage >= 50) return "Неплохо, но можно лучше";
    return "Попробуйте ещё раз";
  }

  function redirectToLogin() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login.html";
  }
});

class StudentStatsManager {
  constructor() {
    this.modal = document.getElementById("studentStatsModal");
    this.currentUser = JSON.parse(localStorage.getItem("user")) || {};
    this.init();
  }

  async init() {
    document
      .getElementById("view-stats-button")
      .addEventListener("click", () => this.showStats());
    await this.createModalIfNotExists();
  }

  async createModalIfNotExists() {
    if (!this.modal) {
      const modalHTML = `
        <div class="modal" id="studentStatsModal">
          <div class="modal-content" style="max-width: 900px;">
            <span class="close">&times;</span>
            <h3>Моя статистика по тестам</h3>
            <div class="stats-table-container">
              <table class="stats-table">
                <thead>
                  <tr>
                    <th>Название теста</th>
                    <th>Автор</th>
                    <th>Попытки</th>
                    <th>Лучший результат</th>
                    <th>Худший результат</th>
                    <th>Средний результат</th>
                    <th>Последняя попытка</th>
                  </tr>
                </thead>
                <tbody id="studentStatsTableBody"></tbody>
              </table>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML("beforeend", modalHTML);
      this.modal = document.getElementById("studentStatsModal");
      this.setupModalEvents();
    }
  }

  setupModalEvents() {
    this.modal.querySelector(".close").addEventListener("click", () => {
      this.modal.classList.remove("active");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.modal.classList.contains("active")) {
        this.modal.classList.remove("active");
      }
    });
  }

  async showStats() {
    try {
      if (!this.modal) {
        await this.createModalIfNotExists();
      }

      const response = await fetch("/api/students/my-stats", {
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error("Ошибка загрузки статистики");
      }

      const stats = await response.json();
      this.renderStats(stats);
      this.modal.classList.add("active");
    } catch (error) {
      console.error("Ошибка:", error);
      alert(error.message || "Не удалось загрузить статистику");
    }
  }

  renderStats(stats) {
    const tableBody = document.getElementById("studentStatsTableBody");
    tableBody.innerHTML = "";

    if (!stats || stats.length === 0) {
      const row = document.createElement("tr");
      row.innerHTML = `<td colspan="7" class="no-stats">Вы еще не проходили тесты</td>`;
      tableBody.appendChild(row);
      return;
    }

    stats.forEach((testStat) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${testStat.test_title}</td>
        <td>${testStat.author || "Неизвестно"}</td>
        <td>${testStat.attempts}</td>
        <td>${testStat.best_score}%</td>
        <td>${testStat.worst_score}%</td>
        <td>${testStat.average_score}%</td>
        <td>${new Date(testStat.last_attempt).toLocaleDateString()}</td>
      `;
      tableBody.appendChild(row);
    });
  }

  getToken() {
    return localStorage.getItem("token") || "";
  }
}
