document.addEventListener("DOMContentLoaded", async () => {
  try {
    // 1. Проверка аутентификации и прав
    const authToken = getAuthToken();
    if (!authToken) {
      redirectToLogin();
      return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== "admin") {
      showAccessDenied();
      return;
    }

    // 2. Инициализация интерфейса
    initUI(currentUser);

    // 3. Загрузка данных
    await Promise.all([loadUsers(authToken), loadGroups(authToken)]);

    // 4. Инициализация админ-панели
    new AdminPanel(authToken, currentUser);
  } catch (error) {
    console.error("Ошибка инициализации:", error);
    showError("Произошла ошибка при загрузке страницы");
  }
});

// ======================
// Основные функции
// ======================

function getAuthToken() {
  return (
    localStorage.getItem("token") ||
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("token="))
      ?.split("=")[1]
  );
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("user")) || null;
  } catch {
    return null;
  }
}

function redirectToLogin() {
  window.location.href = "/login.html";
}

function showAccessDenied() {
  alert("Доступ запрещен. Требуются права администратора.");
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = "none";
  });
}

function initUI(user) {
  // Настройка интерфейса в зависимости от роли
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = user.role === "admin" ? "" : "none";
  });
}

// ======================
// Работа с пользователями
// ======================

async function loadUsers(token) {
  try {
    const response = await fetch("/api/users", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    const users = await response.json();
    renderUsers(users);
    setupUserDeletionHandlers(token);
  } catch (error) {
    console.error("Ошибка загрузки пользователей:", error);
    showError(`Ошибка загрузки пользователей: ${error.message}`);
  }
}

function renderUsers(users) {
  const tbody = document.getElementById("user-table-body");
  if (!tbody) return;

  tbody.innerHTML = users
    .map(
      (user) => `
    <tr>
      <td>${user.id}</td>
      <td>${user.username}</td>
      <td>${user.role}</td>
      <td>${user.group_name || "Не назначена"}</td>
      <td>
        <button data-id="${user.id}" class="delete-btn">Удалить</button>
      </td>
    </tr>
  `
    )
    .join("");
}

function setupUserDeletionHandlers(token) {
  document
    .getElementById("user-table-body")
    ?.addEventListener("click", async (e) => {
      if (!e.target.classList.contains("delete-btn")) return;

      const userId = e.target.dataset.id;
      if (!confirm(`Удалить пользователя ${userId}?`)) return;

      try {
        await deleteUser(userId, token);
        await loadUsers(token);
        showSuccess("Пользователь успешно удален");
      } catch (error) {
        showError(`Ошибка удаления: ${error.message}`);
      }
    });
}

async function deleteUser(userId, token) {
  const response = await fetch(`/api/users/${userId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }
}

// ======================
// Работа с группами
// ======================

async function loadGroups(token) {
  try {
    const response = await fetch("/api/groups", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    const groups = await response.json();
    renderGroupSelects(groups);
  } catch (error) {
    console.error("Ошибка загрузки групп:", error);
    showError(`Ошибка загрузки групп: ${error.message}`);
  }
}

function renderGroupSelects(groups) {
  // Для формы добавления пользователя
  const groupSelect = document.getElementById("group");
  if (groupSelect) {
    groupSelect.innerHTML =
      '<option value="">Выберите группу</option>' +
      groups.map((g) => `<option value="${g.id}">${g.name}</option>`).join("");
  }

  // Для формы регистрации (если есть)
  const regGroupSelect = document.getElementById("reg-group");
  if (regGroupSelect) {
    regGroupSelect.innerHTML =
      '<option value="" disabled selected>Выберите группу</option>' +
      groups.map((g) => `<option value="${g.id}">${g.name}</option>`).join("");
  }
}

// ======================
// Вспомогательные функции
// ======================

async function getErrorMessage(response) {
  try {
    const error = await response.json();
    return error.message || error.error || "Неизвестная ошибка";
  } catch {
    return response.statusText || "Неизвестная ошибка";
  }
}

function showError(message) {
  alert(`Ошибка: ${message}`);
  console.error(message);
}

function showSuccess(message) {
  console.log(message);
  // Можно добавить красивый toast вместо alert
  alert(message);
}

// ======================
// Класс AdminPanel
// ======================

class AdminPanel {
  constructor(token, currentUser) {
    this.token = token;
    this.currentUser = currentUser;
    this.initModal();
    this.setupEventListeners();
  }

  initModal() {
    const modalHTML = `
      <div class="modal" id="groups-modal">
        <div class="modal-content">
          <span class="close">&times;</span>
          <h3>Управление группами</h3>
          <div class="groups-controls">
            <input type="text" id="new-group-name" placeholder="Название группы">
            <button id="create-group-btn" class="btn-primary">Создать группу</button>
          </div>
          <div id="groups-container" class="groups-list"></div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    this.modal = document.getElementById("groups-modal");
    this.setupModalEvents();
  }

  setupModalEvents() {
    document
      .querySelector("#groups-modal .close")
      .addEventListener("click", () => this.closeModal());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.modal.classList.contains("active")) {
        this.closeModal();
      }
    });
  }

  setupEventListeners() {
    document
      .getElementById("manage-groups-btn")
      ?.addEventListener("click", () => this.openModal());

    document
      .getElementById("create-group-btn")
      ?.addEventListener("click", async () => {
        await this.handleCreateGroup();
      });

    document
      .getElementById("user-form")
      ?.addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.handleUserFormSubmit();
      });
  }

  async openModal() {
    this.modal.classList.add("active");
    try {
      await this.loadGroups();
    } catch (error) {
      showError(`Ошибка загрузки групп: ${error.message}`);
    }
  }

  closeModal() {
    this.modal.classList.remove("active");
  }

  async loadGroups() {
    const response = await fetch("/api/groups", {
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    const groups = await response.json();
    this.renderGroups(groups);
  }

  renderGroups(groups) {
    const container = document.getElementById("groups-container");
    if (!container) return;

    container.innerHTML = groups
      .map(
        (group) => `
      <div class="group-item" data-id="${group.id}">
        <span>${group.name}</span>
        <button class="delete-group-btn">🗑️ Удалить</button>
      </div>
    `
      )
      .join("");

    container.querySelectorAll(".delete-group-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const groupId = btn.closest(".group-item").dataset.id;
        await this.handleDeleteGroup(groupId);
      });
    });
  }

  async handleCreateGroup() {
    const nameInput = document.getElementById("new-group-name");
    const name = nameInput.value.trim();

    if (!name) {
      showError("Введите название группы");
      return;
    }

    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ name }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      nameInput.value = "";
      await this.loadGroups();
      await loadGroups(this.token); // Обновляем селекты
      showSuccess("Группа успешно создана");
    } catch (error) {
      showError(`Ошибка создания группы: ${error.message}`);
    }
  }

  async handleDeleteGroup(groupId) {
    if (!confirm(`Удалить группу ${groupId}?`)) return;

    try {
      const response = await fetch(`/api/groups/${groupId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      await this.loadGroups();
      await loadGroups(this.token); // Обновляем селекты
      showSuccess("Группа успешно удалена");
    } catch (error) {
      showError(`Ошибка удаления группы: ${error.message}`);
    }
  }

  async handleUserFormSubmit() {
    const form = document.getElementById("user-form");
    const formData = new FormData(form);
    const data = {
      username: formData.get("username").trim(),
      password: formData.get("password"),
      role: formData.get("role"),
      group_id:
        formData.get("role") === "student" ? formData.get("group") : null,
    };

    // Валидация
    if (!data.username || !data.password) {
      showError("Заполните имя пользователя и пароль");
      return;
    }

    if (data.role === "student" && !data.group_id) {
      showError("Для студента необходимо выбрать группу");
      return;
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      form.reset();
      await loadUsers(this.token);
      showSuccess("Пользователь успешно создан");
    } catch (error) {
      showError(`Ошибка создания пользователя: ${error.message}`);
    }
  }
}
