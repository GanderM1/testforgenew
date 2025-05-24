document.addEventListener("DOMContentLoaded", () => {
  const currentUser = JSON.parse(localStorage.getItem("user")) || {};
  const isAdmin = currentUser.role === "admin";

  // Скрываем административные разделы
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = isAdmin ? "" : "none";
  });

  // Если пользователь не админ - прекращаем выполнение
  if (!isAdmin) {
    console.log("Доступ к административным функциям запрещен");
    return;
  }

  const userTableBody = document.getElementById("user-table-body");
  const userForm = document.getElementById("user-form");
  const groupSelect = document.getElementById("group");
  const roleSelect = document.getElementById("role");

  // Получаем токен
  const token =
    localStorage.getItem("token") ||
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("token="))
      ?.split("=")[1];

  // === Загрузка пользователей ===
  async function loadUsers() {
    try {
      const res = await fetch("/api/users", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Ошибка загрузки пользователей");
      }

      const users = await res.json();
      renderUsers(users);
    } catch (err) {
      console.error("Ошибка загрузки пользователей:", err);
      alert("Ошибка: " + err.message);
    }
  }

  function renderUsers(users) {
    userTableBody.innerHTML = "";
    users.forEach((user) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${user.id}</td>
        <td>${user.username}</td>
        <td>${user.role}</td>
        <td>${user.group_name || "Не назначена"}</td>
        <td>
          <button data-id="${user.id}" class="delete-btn">Удалить</button>
        </td>
      `;
      userTableBody.appendChild(tr);
    });
  }

  // === Загрузка групп ===
  async function loadGroups() {
    try {
      const res = await fetch("/api/groups", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error("Ошибка загрузки групп");

      const groups = await res.json();
      groupSelect.innerHTML = '<option value="">Выберите группу</option>';
      groups.forEach((group) => {
        const option = document.createElement("option");
        option.value = group.id;
        option.textContent = group.name;
        groupSelect.appendChild(option);
      });
    } catch (err) {
      console.error("Ошибка загрузки групп:", err);
      alert("Ошибка: " + err.message);
    }
  }

  // === Обработка формы ===
  userForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;
    const groupId = role === "student" ? groupSelect.value : null;

    // Валидация
    if (!username || !password) {
      return alert("Заполните имя пользователя и пароль");
    }

    if (role === "student" && !groupId) {
      return alert("Для студента необходимо выбрать группу");
    }

    try {
      const requestBody = { username, password, role };
      if (groupId) requestBody.group_id = groupId;

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "Ошибка регистрации");
      }

      userForm.reset();
      loadUsers();
      alert("Пользователь успешно создан");
    } catch (err) {
      console.error("Ошибка регистрации:", err);
      alert("Ошибка: " + err.message);
    }
  });

  // === Удаление пользователя ===
  userTableBody.addEventListener("click", async (e) => {
    if (!e.target.classList.contains("delete-btn")) return;

    const userId = e.target.dataset.id;
    if (!confirm("Удалить пользователя?")) return;

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error("Ошибка удаления");

      loadUsers();
      alert("Пользователь удален");
    } catch (err) {
      console.error("Ошибка удаления:", err);
      alert("Ошибка: " + err.message);
    }
  });

  class AdminPanel {
    constructor() {
      this.token = this.getToken();
      this.currentUser = JSON.parse(localStorage.getItem("user")) || {};

      if (this.currentUser.role === "admin") {
        this.initModal();
        this.initGroupsSection();
        this.setupGroupButton();
        this.setupEscapeHandler();
      }
    }

    getToken() {
      return (
        localStorage.getItem("token") ||
        document.cookie
          .split("; ")
          .find((row) => row.startsWith("token="))
          ?.split("=")[1]
      );
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
      document
        .querySelector("#groups-modal .close")
        .addEventListener("click", () => this.closeModal());
    }

    setupEscapeHandler() {
      this.handleKeyDown = (e) => {
        if (e.key === "Escape" && this.modal.classList.contains("active")) {
          this.closeModal();
        }
      };
    }

    setupGroupButton() {
      const btn = document.getElementById("manage-groups-btn");
      if (btn) {
        btn.addEventListener("click", () => this.openModal());
      }
    }

    openModal() {
      if (this.modal) {
        this.modal.classList.add("active");
        document.addEventListener("keydown", this.handleKeyDown);
        this.loadGroups();
      }
    }

    closeModal() {
      if (this.modal) {
        this.modal.classList.remove("active");
        document.removeEventListener("keydown", this.handleKeyDown);
      }
    }

    async initGroupsSection() {
      const groupsSection = document.getElementById("groups-section");
      if (!groupsSection) return;

      // Загрузка групп
      await this.loadGroups();

      // Обработка создания группы
      document
        .getElementById("create-group-btn")
        .addEventListener("click", async () => {
          const name = document.getElementById("new-group-name").value.trim();
          if (!name) return alert("Введите название группы");

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
              const error = await response.json();
              throw new Error(error.error || "Ошибка создания группы");
            }

            document.getElementById("new-group-name").value = "";
            await this.loadGroups();
            await this.loadGroupSelect(); // Обновляем select в форме пользователей
          } catch (error) {
            console.error("Ошибка создания группы:", error);
            alert("Ошибка: " + error.message);
          }
        });
    }

    async loadGroups() {
      try {
        const response = await fetch("/api/groups", {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });

        if (!response.ok) throw new Error("Ошибка загрузки групп");

        const groups = await response.json();
        this.renderGroups(groups);
      } catch (error) {
        console.error("Ошибка загрузки групп:", error);
        alert("Ошибка: " + error.message);
      }
    }

    renderGroups(groups) {
      const container = document.getElementById("groups-container");
      if (!container) return;

      container.innerHTML = groups
        .map(
          (group) => `
        <div class="group-item1" data-id="${group.id}">
          <span>${group.name}</span>
            <button class="delete-group-btn">🗑️</button>
        </div>
      `
        )
        .join("");

      // Обработчики удаления
      document.querySelectorAll(".delete-group-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const groupId = e.target.closest(".group-item1").dataset.id;
          if (!confirm(`Удалить группу?`)) return;

          try {
            const response = await fetch(`/api/groups/${groupId}`, {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${this.token}`,
              },
            });

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || "Ошибка удаления группы");
            }

            await this.loadGroups();
            await this.loadGroupSelect(); // Обновляем select в форме пользователей
          } catch (error) {
            console.error("Ошибка удаления группы:", error);
            alert("Ошибка: " + error.message);
          }
        });
      });
    }

    async loadGroupSelect() {
      try {
        const response = await fetch("/api/groups", {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });

        if (!response.ok) throw new Error("Ошибка загрузки групп");

        const groups = await response.json();

        // Обновление select для admin панели
        const adminSelect = document.getElementById("group");
        if (adminSelect) {
          adminSelect.innerHTML = '<option value="">Выберите группу</option>';
          groups.forEach((group) => {
            const option = document.createElement("option");
            option.value = group.id;
            option.textContent = group.name;
            adminSelect.appendChild(option);
          });
        }

        // Обновление select для формы регистрации (index.html)
        const regSelect = document.getElementById("reg-group");
        if (regSelect) {
          regSelect.innerHTML =
            '<option value="" disabled selected>Выберите группу</option>';
          groups.forEach((group) => {
            const option = document.createElement("option");
            option.value = group.id;
            option.textContent = group.name;
            regSelect.appendChild(option);
          });
        }
      } catch (error) {
        console.error("Ошибка загрузки групп для select:", error);
      }
    }
  }

  // Инициализация
  loadUsers();
  loadGroups();
  new AdminPanel();
});
