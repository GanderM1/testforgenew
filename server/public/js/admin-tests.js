class TestManager {
  constructor() {
    this.modal = document.getElementById("testModal");
    this.statsModal = document.getElementById("statsModal");
    this.instructionModal = null;
    this.addTestBtn = document.getElementById("add-test-btn");
    this.testTableBody = document.getElementById("test-table-body");
    this.currentUser = JSON.parse(localStorage.getItem("user") || "{}");
    this.currentTestId = null;
    this.groups = [];
    this.init();
  }

  setupTableSorting() {
    const table = document.querySelector(".tests table");
    const headers = table.querySelectorAll("thead th");

    headers.forEach((header, index) => {
      if (index === 0 || index === headers.length - 1) {
        header.style.cursor = "default";
        return;
      }

      header.style.cursor = "pointer";
      header.addEventListener("click", () => {
        this.sortTestsTable(index, header);
      });
    });
  }

  sortTestsTable(columnIndex, header) {
    const table = document.querySelector(".tests table");
    const tbody = table.querySelector("tbody");
    const rows = Array.from(tbody.querySelectorAll("tr"));

    const isAscending = header.classList.contains("asc");

    table.querySelectorAll("thead th").forEach((th) => {
      th.classList.remove("asc", "desc");
    });

    header.classList.toggle("asc", !isAscending);
    header.classList.toggle("desc", isAscending);

    rows.sort((a, b) => {
      const aValue = a.cells[columnIndex].textContent.trim();
      const bValue = b.cells[columnIndex].textContent.trim();

      return isAscending
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    });

    rows.forEach((row) => tbody.appendChild(row));
  }

  async init() {
    if (this.addTestBtn) {
      this.addTestBtn.addEventListener("click", () => this.showCreateModal());
    }

    const instructionBtn = document.querySelector(".tests button:last-child");
    if (instructionBtn) {
      instructionBtn.addEventListener("click", () =>
        this.showInstructionModal()
      );
    }

    await this.loadGroups();
    this.loadTests();
    this.setupTableSorting();
  }

  createInstructionModal() {
    const modalHTML = `
      <div class="modal" id="instructionModal">
        <div class="modal-content" style="max-width: 700px;">
          <span class="close">&times;</span>
          <h3>Инструкция по использованию "Конструктора тестов"</h3>
          <div class="instruction-content">
            <h4>Сортировка таблиц:</h4>
             Для сортировки данных в таблице кликните по названию столбца. Вы можете упорядочить записи по возрастанию/убыванию (числа) или от А до Я / от Я до А (текст). Сортировка недоступна для столбцов "ID" и "Действия".

            <h4>Управление тестами:</h4>
            <ul>
              <li><strong>Добавить тест</strong> - создание нового теста с вопросами и ответами</li>
              <li><strong>✏️ Редактировать</strong> - изменение существующего теста</li>
              <li><strong>📊 Статистика</strong> - просмотр результатов студентов по тесту</li>
              <li><strong>🗑️ Удалить</strong> - удаление теста (действие нельзя отменить)</li>
            </ul>
 
            <h4>Типы вопросов:</h4>
            <ul>
              <li><strong>Один ответ</strong> - студент выбирает один вариант из нескольких</li>
              <li><strong>Несколько ответов</strong> - студент может выбрать несколько правильных вариантов</li>
              <li><strong>Текстовый ответ</strong> - студент вводит ответ вручную (проверяется точное совпадение)</li>
            </ul>
            
            <h4>Доступ к тестам:</h4>
            <ul>
              <li><strong>Общий доступ</strong> - тест доступен всем студентам</li>
              <li><strong>Выбор групп</strong> - тест доступен только выбранным группам</li>
            </ul>
            <div class="p-modal">
            <p>Для преподавателей: вы можете редактировать и просматривать статистику только своих тестов.*</p>
            <p>Для администраторов: доступны все функции управления тестами и пользователями.*</p>
          </div>
            </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    this.instructionModal = document.getElementById("instructionModal");

    this.instructionModal
      .querySelector(".close")
      .addEventListener("click", () => {
        this.instructionModal.classList.remove("active");
      });

    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        this.instructionModal.classList.contains("active")
      ) {
        this.instructionModal.classList.remove("active");
      }
    });
  }

  showInstructionModal() {
    if (!this.instructionModal) {
      this.createInstructionModal();
    }
    this.instructionModal.classList.add("active");
  }

  async loadGroups() {
    try {
      const response = await fetch("/api/groups", {
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
        },
      });
      if (!response.ok) throw new Error("Ошибка загрузки групп");
      this.groups = await response.json();
    } catch (error) {
      console.error("Ошибка загрузки групп:", error);
    }
  }

  async loadTests() {
    try {
      const response = await fetch("/api/tests", {
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
        },
      });
      if (!response.ok) throw new Error("Ошибка загрузки тестов");

      let tests = await response.json();
      tests = this.filterTestsByAccess(tests);
      this.renderTests(tests);
    } catch (error) {
      console.error("Ошибка:", error);
      alert("Не удалось загрузить тесты");
    }
  }

  filterTestsByAccess(tests) {
    if (this.currentUser.role === "admin") return tests;

    return tests.filter((test) => {
      const isAuthor = test.author_id === this.currentUser.id;
      const isGeneralTest = !test.groups || test.groups.length === 0;

      if (this.currentUser.role === "teacher") {
        return isAuthor || isGeneralTest;
      }

      if (this.currentUser.role === "student") {
        const isForMyGroup =
          test.groups &&
          test.groups.some((group) => group.id === this.currentUser.group_id);
        return isGeneralTest || isForMyGroup;
      }

      return false;
    });
  }

  renderTests(tests) {
    this.testTableBody.innerHTML = "";

    tests.forEach((test) => {
      const row = document.createElement("tr");
      const groupsInfo = this.getGroupsInfoHtml(test);

      row.innerHTML = `
        <td>${test.id}</td>
        <td>
          ${test.title}
        </td>
        <td>${test.author || "Неизвестно"}</td>
        <td>${groupsInfo}</td>
        <td>
          <button class="edit-btn" data-id="${test.id}" ${
        this.canEditTest(test) ? "" : "disabled"
      }>✏️</button>
          <button class="stats-btn" data-id="${test.id}" ${
        this.canViewStats(test) ? "" : "disabled"
      }>📊</button>
          <button class="delete-btn" data-id="${test.id}" ${
        this.canDeleteTest(test) ? "" : "disabled"
      }>🗑️</button>
        </td>
      `;
      this.testTableBody.appendChild(row);
    });

    this.setupActionButtons();
  }

  getGroupsInfoHtml(test) {
    if (!test.groups || test.groups.length === 0) {
      return '<div class="groups-info">Общий доступ</div>';
    }

    const groupNames = test.groups.map((g) => g.name).join(", ");
    return `<div class="groups-info">${groupNames}</div>`;
  }

  canEditTest(test) {
    return (
      this.currentUser.role === "admin" ||
      (this.currentUser.role === "teacher" &&
        test.author_id === this.currentUser.id)
    );
  }

  canDeleteTest(test) {
    return this.canEditTest(test);
  }

  canViewStats(test) {
    return (
      this.currentUser.role === "admin" ||
      (this.currentUser.role === "teacher" &&
        test.author_id === this.currentUser.id)
    );
  }

  setupActionButtons() {
    document.querySelectorAll(".stats-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const testId = e.target.dataset.id;
        this.showTestStatistics(testId);
      });
    });

    document.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const testId = e.target.dataset.id;
        this.editTest(testId);
      });
    });

    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const testId = e.target.dataset.id;
        this.deleteTest(testId);
      });
    });
  }

  async showCreateModal() {
    if (!this.modal) {
      this.createModal();
    }

    this.resetModal();
    this.currentTestId = null;

    await this.loadGroups();
    this.renderGroupsSelection([]);

    this.modal.classList.add("active");
    document.addEventListener("keydown", this.handleKeyDown);
  }

  async editTest(testId) {
    try {
      const response = await fetch(`/api/tests/${testId}`, {
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
        },
      });
      if (!response.ok) throw new Error("Ошибка загрузки теста");

      const test = await response.json();
      this.showEditModal(test);
    } catch (error) {
      console.error("Ошибка при редактировании:", error);
      alert("Не удалось загрузить тест для редактирования");
    }
  }

  showEditModal(test) {
    if (!this.modal) {
      this.createModal();
    }

    this.resetModal();
    this.currentTestId = test.id;

    document.getElementById("test-title").value = test.title;
    this.renderGroupsSelection(test.groups || []);
    this.renderQuestions(test.questions || []);

    this.modal.classList.add("active");
    document.addEventListener("keydown", this.handleKeyDown);
  }

  renderGroupsSelection(selectedGroups) {
    const groupsContainer = this.modal.querySelector("#groups-select");
    groupsContainer.innerHTML = "";

    if (this.currentUser.role === "student") return;

    const isGeneral = selectedGroups.length === 0;
    groupsContainer.insertAdjacentHTML(
      "beforeend",
      `
      <label class="group-btn ${isGeneral ? "selected" : ""}">
        <input type="checkbox" class="general-access" ${
          isGeneral ? "checked" : ""
        }>
        <span>Общий доступ</span>
      </label>
      `
    );

    this.groups.forEach((group) => {
      const isSelected = selectedGroups.some((g) => g.id === group.id);
      groupsContainer.insertAdjacentHTML(
        "beforeend",
        `
        <label class="group-btn ${isSelected ? "selected" : ""}">
          <input type="checkbox" value="${group.id}" ${
          isSelected ? "checked" : ""
        }>
          <span>${group.name}</span>
        </label>
        `
      );
    });

    groupsContainer.querySelectorAll(".group-btn input").forEach((checkbox) => {
      checkbox.addEventListener("change", (e) => {
        const btn = e.target.closest(".group-btn");
        if (e.target.classList.contains("general-access")) {
          if (e.target.checked) {
            groupsContainer
              .querySelectorAll(".group-btn:not(:first-child) input")
              .forEach((cb) => {
                cb.checked = false;
                cb.closest(".group-btn").classList.remove("selected");
              });
          }
          btn.classList.toggle("selected", e.target.checked);
        } else {
          if (e.target.checked) {
            groupsContainer.querySelector(".general-access").checked = false;
            groupsContainer
              .querySelector(".group-btn:first-child")
              .classList.remove("selected");
          }
          btn.classList.toggle("selected", e.target.checked);
        }
      });
    });
  }

  renderQuestions(questions) {
    const container = document.getElementById("questions-container");
    container.innerHTML = "";

    questions.forEach((question, index) => {
      const questionId = Date.now();
      const questionHTML = this.getQuestionHtml(
        question,
        questionId,
        index + 1
      );
      container.insertAdjacentHTML("beforeend", questionHTML);

      const questionEl = container.querySelector(`[data-id="${questionId}"]`);
      this.setupQuestionEvents(questionEl);
    });
  }

  getQuestionHtml(question, questionId, questionNumber) {
    return `
      <div class="question" data-id="${questionId}" data-type="${
      question.question_type
    }">
        <div class="question-header">
          <h4>Вопрос ${questionNumber}</h4>
          <button type="button" class="remove-question">Удалить вопрос</button>
        </div>
        <div class="form-group">
          <label>Текст вопроса</label>
          <textarea class="question-text" required>${question.text}</textarea>
        </div>
        <div class="form-group">
          <label>Тип вопроса</label>
          <select class="question-type">
            <option value="single" ${
              question.question_type === "single" ? "selected" : ""
            }>Один ответ</option>
            <option value="multiple" ${
              question.question_type === "multiple" ? "selected" : ""
            }>Несколько ответов</option>
            <option value="text" ${
              question.question_type === "text" ? "selected" : ""
            }>Текстовый ответ</option>
          </select>
        </div>
        ${this.getAnswerFieldsHtml(question, questionId)}
      </div>
    `;
  }

  getAnswerFieldsHtml(question, questionId) {
    if (question.question_type === "text") {
      return `
        <div class="form-group correct-text-answer">
          <label>Правильный текстовый ответ</label>
          <input type="text" class="correct-text" value="${
            question.correct_text_answer || ""
          }" required>
        </div>
      `;
    }

    let answersHtml = `
      <div class="answers-container">
        ${question.answers
          .map(
            (answer) => `
          <div class="answer" data-id="${Date.now()}">
            <input type="text" class="answer-text" value="${
              answer.text
            }" required>
            <label>
              <input type="${
                question.question_type === "multiple" ? "checkbox" : "radio"
              }" 
                     name="correct-${questionId}" 
                     class="is-correct" 
                     ${answer.is_correct ? "checked" : ""}>
              Правильный
            </label>
            <button type="button" class="remove-answer">×</button>
          </div>
        `
          )
          .join("")}
      </div>
      <button type="button" class="add-answer">Добавить ответ</button>
    `;

    return answersHtml;
  }

  setupQuestionEvents(questionEl) {
    questionEl
      .querySelector(".question-type")
      .addEventListener("change", (e) => {
        this.handleQuestionTypeChange(questionEl, e.target.value);
      });

    const addAnswerBtn = questionEl.querySelector(".add-answer");
    if (addAnswerBtn) {
      addAnswerBtn.addEventListener("click", () => {
        this.addAnswer(questionEl.dataset.id);
      });
    }

    questionEl
      .querySelector(".remove-question")
      ?.addEventListener("click", () => {
        questionEl.remove();
        this.updateQuestionNumbers();
      });

    questionEl.querySelectorAll(".remove-answer").forEach((btn) => {
      btn.addEventListener("click", function () {
        this.closest(".answer").remove();
      });
    });
  }

  handleQuestionTypeChange(questionEl, newType) {
    questionEl.dataset.type = newType;
    const answersContainer = questionEl.querySelector(".answers-container");
    const correctTextAnswer = questionEl.querySelector(".correct-text-answer");

    if (newType === "text") {
      if (answersContainer) answersContainer.style.display = "none";
      if (!correctTextAnswer) {
        questionEl.insertAdjacentHTML(
          "beforeend",
          `
          <div class="form-group correct-text-answer">
            <label>Правильный текстовый ответ</label>
            <input type="text" class="correct-text" required>
          </div>
        `
        );
      }
      questionEl.querySelector(".add-answer")?.remove();
    } else {
      if (correctTextAnswer) correctTextAnswer.remove();

      if (!answersContainer) {
        questionEl.insertAdjacentHTML(
          "beforeend",
          `
          <div class="answers-container"></div>
          <button type="button" class="add-answer">Добавить ответ</button>
        `
        );
        this.addAnswer(questionEl.dataset.id);
      } else {
        answersContainer.style.display = "block";
        questionEl.querySelectorAll(".is-correct").forEach((input) => {
          input.type = newType === "multiple" ? "checkbox" : "radio";
          input.name = `correct-${questionEl.dataset.id}`;
        });
      }
    }
  }

  createModal() {
    const modalHTML = `
      <div class="modal" id="testModal">
        <div class="modal-content" style="max-width: 800px;">
          <span class="close">&times;</span>
          <h3 id="modal-title">${
            this.currentTestId ? "Редактировать тест" : "Создать новый тест"
          }</h3>
          <form id="test-form">
            <div class="form-group">
              <label for="test-title">Название теста</label>
              <input type="text" id="test-title" required>
            </div>
            <div class="form-group" id="groups-select-container" ${
              this.currentUser.role === "student" ? 'style="display:none;"' : ""
            }>
              <label>Доступ для групп (выберите группы или оставьте "Общий доступ")</label>
              <div id="groups-select" class="groups-buttons-container"></div>
            </div>
            <div id="questions-container"></div>
            <button type="button" id="add-question" class="btn">Добавить вопрос</button>
            <button type="submit" class="btn primary">Сохранить тест</button>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    this.modal = document.getElementById("testModal");
    this.setupModalEvents();
  }

  setupModalEvents() {
    const closeModal = () => {
      this.modal.classList.remove("active");
      document.removeEventListener("keydown", this.handleKeyDown);
      this.currentTestId = null;
    };

    this.modal.querySelector(".close").addEventListener("click", closeModal);

    this.modal.querySelector("#add-question").addEventListener("click", () => {
      this.addQuestion();
    });

    this.modal.querySelector("#test-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveTest();
    });

    this.handleKeyDown = (e) => {
      if (e.key === "Escape") closeModal();
    };
  }

  addQuestion() {
    const container = document.getElementById("questions-container");
    const questionId = Date.now();
    const questionNumber = container.querySelectorAll(".question").length + 1;

    container.insertAdjacentHTML(
      "beforeend",
      `
      <div class="question" data-id="${questionId}" data-type="single">
        <div class="question-header">
          <h4>Вопрос №${questionNumber}</h4>
          <button type="button" class="remove-question">Удалить вопрос</button>
        </div>
        <div class="form-group"> 
          <label>Текст вопроса</label>
          <textarea class="question-text" required></textarea>
        </div>
        <div class="form-group">
          <label>Тип вопроса</label>
          <select class="question-type">
            <option value="single" selected>Один ответ</option>
            <option value="multiple">Несколько ответов</option>
            <option value="text">Текстовый ответ</option>
          </select>
        </div>
        <div class="answers-container"></div>
        <button type="button" class="add-answer">Добавить ответ</button>
      </div>
    `
    );

    const questionEl = container.querySelector(`[data-id="${questionId}"]`);
    this.setupQuestionEvents(questionEl);
    this.addAnswer(questionId);
  }

  addAnswer(questionId) {
    const questionEl = this.modal.querySelector(`[data-id="${questionId}"]`);
    const type = questionEl.dataset.type;
    const container = questionEl.querySelector(".answers-container");
    const answerId = Date.now();

    container.insertAdjacentHTML(
      "beforeend",
      `
      <div class="answer" data-id="${answerId}">
        <input type="text" class="answer-text" placeholder="Текст ответа" required>
        <label>
          <input type="${type === "multiple" ? "checkbox" : "radio"}" 
                 name="correct-${questionId}" 
                 class="is-correct">
          Правильный
        </label>
        <button type="button" class="remove-answer">×</button>
      </div>
    `
    );

    container
      .querySelector(`[data-id="${answerId}"] .remove-answer`)
      .addEventListener("click", function () {
        this.closest(".answer").remove();
      });
  }

  updateQuestionNumbers() {
    const questions = this.modal.querySelectorAll(".question");
    questions.forEach((question, index) => {
      const header = question.querySelector(".question-header h4");
      if (header) {
        header.textContent = `Вопрос ${index + 1}`;
      }
    });
  }

  async saveTest() {
    try {
      const testData = this.collectTestData();
      this.validateTestData(testData);

      const url = this.currentTestId
        ? `/api/tests/${this.currentTestId}`
        : "/api/tests";
      const method = this.currentTestId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.getToken()}`,
        },
        body: JSON.stringify(testData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Ошибка сохранения теста");
      }

      this.modal.classList.remove("active");
      this.loadTests();
      alert(`Тест успешно ${this.currentTestId ? "обновлён" : "создан"}!`);
    } catch (error) {
      console.error("Ошибка:", error);
      alert(`Ошибка: ${error.message}`);
    }
  }

  collectTestData() {
    const title = document.getElementById("test-title").value.trim();
    const groupIds = this.getSelectedGroupIds();
    const questions = this.collectQuestions();

    return {
      title,
      group_ids: groupIds,
      questions,
      author_id: this.currentUser.id,
    };
  }

  getSelectedGroupIds() {
    if (this.currentUser.role === "student") return [];

    const generalAccess = this.modal.querySelector(".general-access").checked;
    if (generalAccess) return [];

    const checkboxes = this.modal.querySelectorAll(
      "#groups-select .group-btn:not(:first-child) input[type=checkbox]:checked"
    );
    return Array.from(checkboxes).map((cb) => parseInt(cb.value));
  }

  collectQuestions() {
    const questions = [];

    this.modal.querySelectorAll(".question").forEach((qEl) => {
      const text = qEl.querySelector(".question-text").value.trim();
      const type = qEl.querySelector(".question-type").value;
      const question = { text, question_type: type };

      if (type === "text") {
        question.correct_text_answer = qEl
          .querySelector(".correct-text")
          .value.trim();
      } else {
        question.answers = this.collectQuestionAnswers(qEl);
      }

      questions.push(question);
    });

    return questions;
  }

  collectQuestionAnswers(questionEl) {
    const answers = [];

    questionEl.querySelectorAll(".answer").forEach((aEl) => {
      const text = aEl.querySelector(".answer-text").value.trim();
      if (text) {
        answers.push({
          text,
          is_correct: aEl.querySelector(".is-correct").checked,
        });
      }
    });

    return answers;
  }

  validateTestData(data) {
    if (!data.title || data.title.length < 3) {
      throw new Error("Название теста обязательно (мин. 3 символа)");
    }

    if (!data.questions || data.questions.length === 0) {
      throw new Error("Тест должен содержать хотя бы один вопрос");
    }

    data.questions.forEach((q, i) => {
      if (!q.text || q.text.trim() === "") {
        throw new Error(`Вопрос ${i + 1}: текст вопроса обязателен`);
      }

      if (q.question_type === "text") {
        if (!q.correct_text_answer || q.correct_text_answer.trim() === "") {
          throw new Error(
            `Вопрос ${i + 1}: укажите правильный текстовый ответ`
          );
        }
      } else if (!q.answers || q.answers.length === 0) {
        throw new Error(`Вопрос ${i + 1}: добавьте хотя бы один ответ`);
      } else if (q.answers.every((a) => !a.is_correct)) {
        throw new Error(
          `Вопрос ${i + 1}: укажите хотя бы один правильный ответ`
        );
      } else if (
        q.question_type === "single" &&
        q.answers.filter((a) => a.is_correct).length > 1
      ) {
        throw new Error(
          `Вопрос ${i + 1}: можно выбрать только один правильный ответ`
        );
      }
    });
  }

  async deleteTest(testId) {
    if (!confirm("Вы уверены, что хотите удалить этот тест?")) return;

    try {
      const response = await fetch(`/api/tests/${testId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Ошибка удаления теста");
      }

      this.loadTests();
      alert("Тест успешно удален");
    } catch (error) {
      console.error("Ошибка при удалении:", error);
      alert(error.message);
    }
  }

  async showTestStatistics(testId) {
    try {
      const response = await fetch(`/api/tests/${testId}/statistics`, {
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Ошибка загрузки статистики");
      }

      const stats = await response.json();
      this.renderStatisticsModal(stats);
    } catch (error) {
      console.error("Ошибка:", error);
      alert(error.message || "Не удалось загрузить статистику теста");
    }
  }

  renderStatisticsModal(statistics) {
    if (!this.statsModal) {
      this.createStatsModal();
    }

    const tableBody = this.statsModal.querySelector("#statsTableBody");
    tableBody.innerHTML = "";

    statistics.userStats.forEach((user) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${user.username}</td>
        <td>${user.group || "Не указана"}</td>
        <td>${user.attempts}</td>
        <td>${user.bestScore}%</td>
        <td>${user.worstScore}%</td>
        <td>${user.averageScore}%</td>
      `;
      tableBody.appendChild(row);
    });

    this.statsModal.querySelector("#totalUsers").textContent =
      statistics.totalUsers;
    this.statsModal.querySelector("#totalAttempts").textContent =
      statistics.totalAttempts;
    this.statsModal.classList.add("active");
    this.setupStatsTableSorting();

    document.addEventListener("keydown", this.handleStatsKeyDown);
  }

  setupStatsTableSorting() {
    const table = this.statsModal.querySelector(".stats-table");
    const headers = table.querySelectorAll("thead th");

    headers.forEach((header, index) => {
      header.style.cursor = "pointer";
      header.addEventListener("click", () => {
        this.sortStatsTable(index, header);
      });
    });
  }

  sortStatsTable(columnIndex, header) {
    const table = this.statsModal.querySelector(".stats-table");
    const tbody = table.querySelector("tbody");
    const rows = Array.from(tbody.querySelectorAll("tr"));

    const isAscending = header.classList.contains("asc");

    table.querySelectorAll("thead th").forEach((th) => {
      th.classList.remove("asc", "desc");
    });

    header.classList.toggle("asc", !isAscending);
    header.classList.toggle("desc", isAscending);

    rows.sort((a, b) => {
      let aValue = a.cells[columnIndex].textContent.trim();
      let bValue = b.cells[columnIndex].textContent.trim();

      if (columnIndex >= 2) {
        if (columnIndex >= 3) {
          aValue = parseFloat(aValue);
          bValue = parseFloat(bValue);
        } else {
          aValue = parseInt(aValue);
          bValue = parseInt(bValue);
        }

        return isAscending ? aValue - bValue : bValue - aValue;
      } else {
        return isAscending
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
    });

    rows.forEach((row) => tbody.appendChild(row));
  }

  createStatsModal() {
    const modalHTML = `
      <div class="modal" id="statsModal">
        <div class="modal-content" style="max-width: 900px;">
          <span class="close">&times;</span>
          <h3>Статистика теста</h3>
          <div class="user-filter">
            <input type="text" id="userSearch" placeholder="Поиск по имени пользователя...">
            <button id="refreshStats">Обновить</button>
          </div>
          <div class="stats-table-container">
            <table class="stats-table">
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Группа</th>
                  <th>Попытки</th>
                  <th>Лучший результат</th>
                  <th>Худший результат</th>
                  <th>Средний результат</th>
                </tr>
              </thead>
              <tbody id="statsTableBody"></tbody>
            </table>
          </div>
          <div class="stats-summary">
            <div class="summary-item">
              <span class="summary-label">Всего пользователей:</span>
              <span class="summary-value" id="totalUsers">0</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Всего попыток:</span>
              <span class="summary-value" id="totalAttempts">0</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    this.statsModal = document.getElementById("statsModal");

    this.statsModal.querySelector(".close").addEventListener("click", () => {
      this.statsModal.classList.remove("active");
    });

    this.handleStatsKeyDown = (e) => {
      if (e.key === "Escape") {
        this.statsModal.classList.remove("active");
        document.removeEventListener("keydown", this.handleStatsKeyDown);
      }
    };

    this.statsModal
      .querySelector("#refreshStats")
      .addEventListener("click", () => {
        if (this.currentTestId) this.showTestStatistics(this.currentTestId);
      });

    this.statsModal
      .querySelector("#userSearch")
      .addEventListener("input", (e) => {
        this.filterStatsTable(e.target.value);
      });
  }

  filterStatsTable(searchTerm) {
    const rows = this.statsModal.querySelectorAll("#statsTableBody tr");
    const term = searchTerm.toLowerCase();

    rows.forEach((row) => {
      const username = row.cells[0].textContent.toLowerCase();
      row.style.display = username.includes(term) ? "" : "none";
    });
  }

  getToken() {
    return localStorage.getItem("token") || "";
  }

  resetModal() {
    if (this.modal) {
      document.getElementById("test-title").value = "";
      document.getElementById("questions-container").innerHTML = "";
      document.getElementById("groups-select").innerHTML = "";
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new TestManager();
});
