document.addEventListener("DOMContentLoaded", () => {
  const currentUser = JSON.parse(localStorage.getItem("user")) || {};
  const isAdmin = currentUser.role === "admin";

  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = isAdmin ? "" : "none";
  });

  if (!isAdmin) {
    console.log("Доступ к административным функциям запрещен");
    return;
  }

  const userTableBody = document.getElementById("user-table-body");
  const userForm = document.getElementById("user-form");
  const groupSelect = document.getElementById("group");
  const roleSelect = document.getElementById("role");

  const token =
    localStorage.getItem("token") ||
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("token="))
      ?.split("=")[1];

  let currentUsers = [];

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

      currentUsers = await res.json();
      renderUsers(currentUsers);
      setupTableSorting();
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

  function setupTableSorting() {
    const table = document.querySelector(".admin-panel .users table");
    if (!table) return;

    const headers = table.querySelectorAll("thead th");

    headers.forEach((header, index) => {
      if (index === 0 || index === headers.length - 1) {
        header.style.cursor = "default";
        return;
      }

      header.style.cursor = "pointer";
      header.addEventListener("click", () => {
        sortUsersTable(index, header);
      });
    });
  }

  function sortUsersTable(columnIndex, header) {
    const table = document.querySelector(".admin-panel .users table");

    const isAscending = header.classList.contains("asc");

    table.querySelectorAll("thead th").forEach((th) => {
      th.classList.remove("asc", "desc");
    });

    header.classList.toggle("asc", !isAscending);
    header.classList.toggle("desc", isAscending);

    const roleWeights = {
      admin: 3,
      teacher: 2,
      student: 1,
    };

    const sortedUsers = [...currentUsers].sort((a, b) => {
      let aValue, bValue;

      switch (columnIndex) {
        case 1:
          aValue = a.username.toLowerCase();
          bValue = b.username.toLowerCase();
          break;
        case 2:
          aValue = roleWeights[a.role.toLowerCase()] || 0;
          bValue = roleWeights[b.role.toLowerCase()] || 0;
          return isAscending ? aValue - bValue : bValue - aValue;
        case 3:
          aValue = (a.group_name || "").toLowerCase();
          bValue = (b.group_name || "").toLowerCase();
          break;
        default:
          return 0;
      }

      return isAscending
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    });

    renderUsers(sortedUsers);
  }

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

  userForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;
    const groupId = role === "student" ? groupSelect.value : null;

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

      await this.loadGroups();

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
            await this.loadGroupSelect();
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
            await this.loadGroupSelect();
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

  loadUsers();
  loadGroups();
  new AdminPanel();
});
