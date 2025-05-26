function redirectToLogin() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/index.html";
}

async function makeAuthRequest(url, method = "GET", body = null) {
  const token = localStorage.getItem("token");
  if (!token) {
    redirectToLogin();
    throw new Error("Требуется авторизация");
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : null,
    });

    if (response.status === 403) {
      const data = await response.json();
      throw new Error(data.message || "Недостаточно прав");
    }

    if (!response.ok) {
      throw new Error(`Ошибка сервера: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.debug(`Ошибка в запросе к ${url}:`, error.message);
    throw error;
  }
}

async function loadGroupsPublic() {
  try {
    const res = await fetch("/api/groups");
    if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error("Ошибка при загрузке групп (public):", error);
    return [];
  }
}

async function loadGroups(authRequired = true) {
  try {
    const groups = authRequired
      ? await makeAuthRequest("/api/groups")
      : await loadGroupsPublic();

    const groupSelect = document.getElementById("group");
    if (!groupSelect) return;

    groupSelect.innerHTML =
      '<option value="" disabled selected>Выберите группу</option>';

    groups.forEach((group) => {
      const option = document.createElement("option");
      option.value = group.id;
      option.textContent = group.name;
      groupSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Ошибка загрузки групп:", error);
    alert("Ошибка при загрузке групп: " + error.message);
  }
}

async function loadUsers() {
  try {
    const users = await makeAuthRequest("/api/users");
    const userTableBody = document.getElementById("user-table-body");
    if (!userTableBody) return;
    userTableBody.innerHTML = "";

    users.forEach((user) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${user.id}</td>
        <td>${user.username}</td>
        <td>${user.role}</td>
        <td>${user.group_id || "Не назначена"}</td>
        <td>
          <button class="delete-btn" data-id="${user.id}">Удалить</button>
        </td>
      `;
      userTableBody.appendChild(row);
    });
  } catch (error) {
    if (error.message.includes("Недостаточно прав")) {
      console.log("Преподаватель не имеет доступа к списку пользователей");
      return;
    }

    console.error("Ошибка загрузки пользователей:", error);
    if (JSON.parse(localStorage.getItem("user"))?.role === "admin") {
      alert(`Ошибка: ${error.message}`);
    }
  }
}

function setupLoginForm() {
  const loginForm = document.getElementById("login-form");
  if (!loginForm) return;

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("login-name").value.trim();
    const password = document.getElementById("login-pass").value;
    const errorElement = document.getElementById("login-error");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Ошибка входа");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      if (data.user.role === "admin" || data.user.role === "teacher") {
        window.location.href = "admin.html";
      } else {
        window.location.href = "student.html";
      }
    } catch (error) {
      console.error("Ошибка входа:", error);
      errorElement.textContent = error.message;
      errorElement.style.display = "block";
    }
  });
}

function setupRegisterForm() {
  const registerForm = document.getElementById("register-form");
  if (!registerForm) return;

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("reg-name").value.trim();
    const password = document.getElementById("reg-pass").value;
    const group_id = document.getElementById("group").value;

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, group_id, role: "student" }),
      });

      const data = await response.json();
      console.log("Ответ от сервера:", data);

      if (!response.ok) {
        throw new Error(data.error || "Ошибка регистрации");
      }

      alert("Регистрация прошла успешно! Вы можете войти.");
      document.getElementById("register-modal").style.display = "none";
    } catch (error) {
      console.error("Ошибка регистрации:", error);
      alert("Ошибка при регистрации: " + error.message);
    }
  });
}

function checkAuth() {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const currentPage = window.location.pathname.split("/").pop();

  if (!token && !["index.html", "register.html"].includes(currentPage)) {
    window.location.href = "/index.html";
    return;
  }

  if (token) {
    if (currentPage === "login.html" || currentPage === "register.html") {
      window.location.href =
        user.role === "admin" ? "admin.html" : "student.html";
    }
  }
}

function closeAllModals() {
  const loginModal = document.getElementById("login-modal");
  const registerModal = document.getElementById("register-modal");

  if (loginModal) loginModal.style.display = "none";
  if (registerModal) registerModal.style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
  checkAuth();

  const initTheme = () => {
    const savedTheme = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
    const themeToggle = document.getElementById("theme-toggle");
    if (themeToggle) {
      themeToggle.textContent = savedTheme === "dark" ? "🌞" : "🌙";
    }
  };

  const setupThemeToggle = () => {
    const themeToggle = document.getElementById("theme-toggle");
    if (!themeToggle) return;

    themeToggle.addEventListener("click", (e) => {
      e.preventDefault();
      const currentTheme = document.documentElement.getAttribute("data-theme");
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", newTheme);
      localStorage.setItem("theme", newTheme);
      themeToggle.textContent = newTheme === "dark" ? "🌞" : "🌙";
    });
  };

  const loginBtn = document.getElementById("login-btn");
  const registerBtn = document.getElementById("register-btn");
  const loginModal = document.getElementById("login-modal");
  const registerModal = document.getElementById("register-modal");
  const closeBtns = document.querySelectorAll(".close");

  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      loginModal.style.display = "flex";
    });
  }

  if (registerBtn) {
    registerBtn.addEventListener("click", () => {
      registerModal.style.display = "flex";
      loadGroups(false);
    });
  }

  closeBtns.forEach((btn) => {
    btn.addEventListener("click", closeAllModals);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllModals();
    }
  });

  initTheme();
  setupThemeToggle();
  setupLoginForm();
  setupRegisterForm();

  if (window.location.pathname.includes("admin.html")) {
    loadGroups(true);
    loadUsers();
  }
});

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("toggle-password")) {
    const inputId = e.target.dataset.target;
    const passwordInput = document.getElementById(inputId);
    if (!passwordInput) return;

    if (passwordInput.type === "password") {
      passwordInput.type = "text";
      e.target.textContent = "🙈"; // меняем иконку
    } else {
      passwordInput.type = "password";
      e.target.textContent = "👁";
    }
  }
});
