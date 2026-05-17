let episodes = [];

const state = {
  current: episodes[0],
  favorites: new Set(JSON.parse(localStorage.getItem("petcast:favorites") || "[]")),
  progress: JSON.parse(localStorage.getItem("petcast:progress") || "{}"),
  comments: JSON.parse(localStorage.getItem("petcast:comments") || "{}"),
  adminAuthenticated: localStorage.getItem("petcast:admin-auth") === "true",
  adminToken: localStorage.getItem("petcast:admin-token") || "",
  trackedPlays: new Set(),
};

const adminCredentials = {
  email: "mariola@auladeformadores.com",
};

const consultationEmail = "mariola@auladeformadores.com";
const fixedTopics = ["Nutrición", "Conducta", "Salud", "Bienestar", "Adopción", "Juego", "Historias"];
const defaultCoverPools = {
  Gatos: [
    "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1495360010541-f48722b34f7d?auto=format&fit=crop&w=900&q=80",
  ],
  Perros: [
    "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=900&q=80",
  ],
  "Perros y gatos": [
    "https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1601758124510-52d02ddb7cbd?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1537151625747-768eb6cf92b2?auto=format&fit=crop&w=900&q=80",
  ],
};

function pickDefaultCover(pet, seed = "") {
  const pool = defaultCoverPools[pet] || defaultCoverPools["Perros y gatos"];
  const score = String(seed || pet)
    .split("")
    .reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 7);
  return pool[score % pool.length];
}

const selectors = {
  grid: document.querySelector("#episodeGrid"),
  timeline: document.querySelector("#timeline"),
  topic: document.querySelector("#topic"),
  keyword: document.querySelector("#keyword"),
  quickSearch: document.querySelector("#quickSearch"),
  petType: document.querySelector("#petType"),
  date: document.querySelector("#dateFilter"),
  onlyInterviews: document.querySelector("#onlyInterviews"),
  onlyShort: document.querySelector("#onlyShort"),
  consultationForm: document.querySelector("#consultationForm"),
  consultationStatus: document.querySelector("#consultationStatus"),
  currentTitle: document.querySelector("#currentTitle"),
  currentDescription: document.querySelector("#currentDescription"),
  currentMeta: document.querySelector("#currentMeta"),
  currentCover: document.querySelector("#currentCover"),
  audio: document.querySelector("#audioPlayer"),
  source: document.querySelector("#audioSource"),
  favoriteCurrent: document.querySelector("#favoriteCurrent"),
  adminRows: document.querySelector("#adminRows"),
  adminLoginForm: document.querySelector("#adminLoginForm"),
  adminLoginError: document.querySelector("#adminLoginError"),
  adminPrivate: document.querySelector("#adminPrivate"),
  adminLogout: document.querySelector("#adminLogout"),
  dashboardPlays: document.querySelector("#dashboardPlays"),
  dashboardConsultations: document.querySelector("#dashboardConsultations"),
  dashboardPublished: document.querySelector("#dashboardPublished"),
  dashboardScheduled: document.querySelector("#dashboardScheduled"),
  topicChart: document.querySelector("#topicChart"),
  episodeRanking: document.querySelector("#episodeRanking"),
  notificationCount: document.querySelector("#notificationCount"),
  notificationList: document.querySelector("#notificationList"),
  drawer: document.querySelector("#notificationDrawer"),
};

function formatDate(value) {
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isPublished(episode) {
  return !episode.date || episode.date <= todayKey();
}

function getPublishedEpisodes() {
  return episodes.filter(isPublished);
}

function getEpisodeStatus(episode) {
  return isPublished(episode) ? "Publicado" : "Programado";
}

function getDaysUntil(dateValue) {
  const today = new Date(`${todayKey()}T12:00:00`);
  const target = new Date(`${dateValue}T12:00:00`);
  return Math.round((target - today) / 86400000);
}

function compactNumber(value) {
  return new Intl.NumberFormat("es", { notation: "compact" }).format(value);
}

function saveFavorites() {
  localStorage.setItem("petcast:favorites", JSON.stringify([...state.favorites]));
}

function saveProgress() {
  localStorage.setItem("petcast:progress", JSON.stringify(state.progress));
}

function saveComments() {
  localStorage.setItem("petcast:comments", JSON.stringify(state.comments));
}

function buildNotifications(dashboard = null) {
  const published = getPublishedEpisodes();
  const newest = published.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  const scheduled = episodes
    .filter((episode) => !isPublished(episode))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const progressEntry = Object.entries(state.progress).sort((a, b) => b[1] - a[1])[0];
  const progressEpisode = progressEntry ? episodes.find((episode) => episode.id === progressEntry[0]) : null;
  const notifications = [];

  if (newest) {
    notifications.push({
      title: "Nuevo episodio disponible",
      body: `${newest.title} ya está publicado en ${newest.topic}.`,
      link: "#explorar",
      action: "Escuchar",
    });
  }

  if (scheduled && state.adminAuthenticated) {
    const days = getDaysUntil(scheduled.date);
    notifications.push({
      title: "Publicación programada",
      body: `${scheduled.title} saldrá ${days === 1 ? "mañana" : `en ${days} días`}.`,
      link: "#admin",
      action: "Ver admin",
    });
  }

  if (dashboard?.recentConsultations?.length && state.adminAuthenticated) {
    const latestConsultation = dashboard.recentConsultations[0];
    notifications.push({
      title: "Nueva consulta recibida",
      body: `${latestConsultation.name || "Una persona"} pregunta sobre ${latestConsultation.topic || latestConsultation.pet || "mascotas"}.`,
      link: "#admin",
      action: "Revisar",
    });
  }

  if (progressEpisode) {
    notifications.push({
      title: "Continúa escuchando",
      body: `${progressEpisode.title} se quedó en el minuto ${Math.floor(progressEntry[1] / 60)}.`,
      link: "#inicio",
      action: "Continuar",
    });
  }

  return notifications;
}

function renderNotifications(dashboard = null) {
  const notifications = buildNotifications(dashboard);
  selectors.notificationCount.textContent = String(notifications.length);
  selectors.notificationCount.hidden = notifications.length === 0;
  selectors.notificationList.innerHTML = notifications.length
    ? notifications
        .map(
          (notification) => `
        <article class="notification-item">
          <strong>${escapeHtml(notification.title)}</strong>
          <p>${escapeHtml(notification.body)}</p>
          <a href="${notification.link}">${escapeHtml(notification.action)}</a>
        </article>
      `
        )
        .join("")
    : `<p class="notification-empty">No hay avisos nuevos por ahora.</p>`;
}

function renderBars(container, items, emptyText) {
  if (!container) return;

  const max = Math.max(...items.map((item) => item.count), 1);
  container.innerHTML = items.length
    ? items
        .map(
          (item) => `
        <div class="dashboard-bar">
          <div>
            <span>${escapeHtml(item.name || item.title)}</span>
            <span>${item.count}</span>
          </div>
          <span class="bar-track"><span class="bar-fill" style="width: ${(item.count / max) * 100}%"></span></span>
        </div>
      `
        )
        .join("")
    : `<p class="dashboard-empty">${emptyText}</p>`;
}

function renderRanking(container, items, emptyText) {
  if (!container) return;

  container.innerHTML = items.length
    ? items
        .map(
          (item) => `
        <div class="ranking-row">
          <span>${escapeHtml(item.title)}</span>
          <strong>${item.count}</strong>
        </div>
      `
        )
        .join("")
    : `<p class="dashboard-empty">${emptyText}</p>`;
}

async function loadDashboard() {
  if (location.protocol === "file:" || !state.adminAuthenticated) return;

  try {
    const response = await fetch("/api/dashboard");
    if (!response.ok) return;

    const dashboard = await response.json();
    selectors.dashboardPlays.textContent = dashboard.totals.plays.toLocaleString("es");
    selectors.dashboardConsultations.textContent = dashboard.totals.consultations.toLocaleString("es");
    selectors.dashboardPublished.textContent = dashboard.totals.published.toLocaleString("es");
    selectors.dashboardScheduled.textContent = `${dashboard.totals.scheduled.toLocaleString("es")} programados`;
    renderBars(selectors.topicChart, dashboard.topics, "Todavía no hay reproducciones registradas.");
    renderRanking(selectors.episodeRanking, dashboard.episodes, "Todavía no hay escuchas por episodio.");
    renderNotifications(dashboard);
  } catch {
    // The admin still works if analytics are unavailable locally.
  }
}

async function recordPlay(episode) {
  if (!episode || location.protocol === "file:" || state.trackedPlays.has(episode.id)) return;

  state.trackedPlays.add(episode.id);
  episode.plays = (episode.plays || 0) + 1;

  try {
    await fetch("/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "episode_play",
        episodeId: episode.id,
        episodeTitle: episode.title,
        topic: episode.topic,
        pet: episode.pet,
      }),
    });
    loadDashboard();
  } catch {
    // Playback must never depend on analytics.
  }
}

async function loadServerEpisodes() {
  if (location.protocol === "file:") return;

  try {
    const response = await fetch("/api/episodes");
    if (!response.ok) return;

    const serverEpisodes = await response.json();
    const existingIds = new Set(episodes.map((episode) => episode.id));
    episodes = [...serverEpisodes.filter((episode) => !existingIds.has(episode.id)), ...episodes];
    state.current = getPublishedEpisodes()[0] || episodes[0] || state.current;
  } catch {
    // The static file version still works without the local server API.
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAdminAccess() {
  selectors.adminLoginForm.hidden = state.adminAuthenticated;
  selectors.adminPrivate.hidden = !state.adminAuthenticated;
  selectors.adminLoginError.textContent = "";
}

function forceNormalPlayback(audio) {
  audio.controlsList?.add("nodownload");
  audio.controlsList?.add("noplaybackrate");
  audio.disablePictureInPicture = true;
  audio.defaultPlaybackRate = 1;
  audio.playbackRate = 1;

  if ("preservesPitch" in audio) audio.preservesPitch = true;
  if ("mozPreservesPitch" in audio) audio.mozPreservesPitch = true;
  if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = true;
}

function normalizeAllPlayers() {
  document.querySelectorAll("audio").forEach(forceNormalPlayback);
}

function getAudioDurationMinutes(file) {
  if (!file) return Promise.resolve(26);

  return new Promise((resolveDuration) => {
    const audio = document.createElement("audio");
    const objectUrl = URL.createObjectURL(file);

    audio.preload = "metadata";
    audio.src = objectUrl;
    audio.addEventListener(
      "loadedmetadata",
      () => {
        const minutes = Math.max(1, Math.round(audio.duration / 60));
        URL.revokeObjectURL(objectUrl);
        resolveDuration(Number.isFinite(minutes) ? minutes : 26);
      },
      { once: true }
    );
    audio.addEventListener(
      "error",
      () => {
        URL.revokeObjectURL(objectUrl);
        resolveDuration(26);
      },
      { once: true }
    );
  });
}

function setCurrentEpisode(episode, autoplay = true) {
  if (!episode) {
    selectors.currentTitle.textContent = "Sin episodios publicados";
    selectors.currentDescription.textContent = "Cuando Mariola publique el primer audio, aparecerá aquí para escucharlo.";
    selectors.currentCover.src = pickDefaultCover("Perros y gatos", "empty");
    selectors.currentCover.alt = "";
    selectors.source.removeAttribute("src");
    selectors.audio.load();
    selectors.currentMeta.innerHTML = "";
    selectors.favoriteCurrent.textContent = "Guardar favorito";
    return;
  }

  state.current = episode;
  selectors.currentTitle.textContent = episode.title;
  selectors.currentDescription.textContent = episode.description;
  selectors.currentCover.src = episode.cover;
  selectors.currentCover.alt = "";
  selectors.source.src = episode.audio;
  selectors.audio.load();
  forceNormalPlayback(selectors.audio);
  selectors.currentMeta.innerHTML = [
    episode.topic,
    episode.pet,
    episode.type,
    `${episode.duration} min`,
    "Gratis",
  ]
    .map((item) => `<span>${item}</span>`)
    .join("");
  selectors.favoriteCurrent.textContent = state.favorites.has(episode.id)
    ? "Favorito guardado"
    : "Guardar favorito";

  if (state.progress[episode.id]) {
    selectors.audio.currentTime = state.progress[episode.id];
  }

  if (autoplay) {
    selectors.audio.play().catch(() => {});
  }
}

function getFilteredEpisodes() {
  const keyword = selectors.keyword.value.trim().toLowerCase();
  const topic = selectors.topic.value;
  const pet = selectors.petType.value;
  const date = selectors.date.value;

  return getPublishedEpisodes().filter((episode) => {
    const haystack = `${episode.title} ${episode.description} ${episode.topic}`.toLowerCase();
    const matchesKeyword = !keyword || haystack.includes(keyword);
    const matchesTopic = !topic || episode.topic === topic;
    const matchesPet = !pet || episode.pet === pet;
    const matchesDate = !date || episode.date === date;
    const matchesInterview = !selectors.onlyInterviews.checked || episode.type === "Entrevista";
    const matchesShort = !selectors.onlyShort.checked || episode.duration < 30;

    return (
      matchesKeyword &&
      matchesTopic &&
      matchesPet &&
      matchesDate &&
      matchesInterview &&
      matchesShort
    );
  });
}

function renderEpisodes() {
  const filtered = getFilteredEpisodes();

  selectors.grid.innerHTML =
    filtered.length === 0
      ? `<p class="empty-state">No hay episodios con esos filtros. Prueba con otra fecha o tema.</p>`
      : filtered
          .map((episode) => {
            const comments = state.comments[episode.id] || [];
            const isFavorite = state.favorites.has(episode.id);

            return `
        <article class="episode-card">
          <img class="episode-cover" src="${episode.cover}" alt="Portada de ${escapeHtml(episode.title)}" loading="lazy" />
          <div class="episode-body">
            <div>
              <span class="tag">${escapeHtml(episode.topic)} · ${escapeHtml(episode.pet)}</span>
              <h3>${escapeHtml(episode.title)}</h3>
            </div>
            <p>${escapeHtml(episode.description)}</p>
            <audio class="episode-player" data-episode-audio="${episode.id}" controls controlslist="nodownload noplaybackrate" disablepictureinpicture preload="metadata" aria-label="Reproductor de ${escapeHtml(episode.title)}">
              <source src="${episode.audio}" type="audio/mpeg" />
            </audio>
            <div class="episode-actions">
              <span class="tag">${episode.duration} min · ${compactNumber(episode.plays)} escuchas</span>
              <button class="favorite-button${isFavorite ? " active" : ""}" type="button" data-favorite="${episode.id}" aria-pressed="${isFavorite}">
                ${isFavorite ? "Favorito" : "Guardar"}
              </button>
              <button type="button" data-play="${episode.id}">Abrir arriba</button>
            </div>
            <div class="comment-box">
              <strong>Comentarios (${comments.length})</strong>
              <div class="comment-list">
                ${
                  comments.length
                    ? comments.map((comment) => `<p>${escapeHtml(comment)}</p>`).join("")
                    : `<p class="comment-empty">Sé la primera persona en comentar.</p>`
                }
              </div>
              <form class="comment-form" data-comment-form="${episode.id}">
                <label class="sr-only" for="comment-${episode.id}">Añadir comentario</label>
                <input id="comment-${episode.id}" name="comment" type="text" maxlength="120" placeholder="Escribe un comentario breve" />
                <button type="submit">Comentar</button>
              </form>
            </div>
          </div>
        </article>
      `;
          })
          .join("");
  normalizeAllPlayers();
}

function renderTimeline() {
  selectors.timeline.innerHTML = [...getPublishedEpisodes()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(
      (episode) => `
      <article class="timeline-item">
        <time datetime="${episode.date}">${formatDate(episode.date)}</time>
        <div>
          <h3>${episode.title}</h3>
          <p>${episode.topic} · ${episode.pet} · ${episode.type}</p>
        </div>
        <button class="ghost-button" type="button" data-play="${episode.id}">Escuchar</button>
      </article>
    `
    )
    .join("");
}

function renderAdminRows() {
  selectors.adminRows.innerHTML = episodes
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)
    .map(
      (episode) => `
      <tr>
        <td>${episode.title}</td>
        <td>${episode.type}</td>
        <td>${getEpisodeStatus(episode)}</td>
        <td>${formatDate(episode.date)}</td>
        <td>${episode.plays.toLocaleString("es")}</td>
        <td><button class="danger-button" type="button" data-delete-episode="${episode.id}">Borrar</button></td>
      </tr>
    `
    )
    .join("");
}

async function deleteEpisode(id) {
  const episode = episodes.find((item) => item.id === id);
  if (!episode || !state.adminAuthenticated) return;

  const confirmed = window.confirm(`¿Borrar "${episode.title}"? Esta acción quitará el audio de la web.`);
  if (!confirmed) return;

  const response = await fetch(`/api/episodes?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "x-admin-token": state.adminToken },
  });

  if (!response.ok) {
    alert("No se ha podido borrar el episodio. Vuelve a iniciar sesión e inténtalo de nuevo.");
    return;
  }

  episodes = episodes.filter((item) => item.id !== id);
  delete state.comments[id];
  delete state.progress[id];
  state.favorites.delete(id);
  saveComments();
  saveProgress();
  saveFavorites();
  hydrateTopics();
  renderEpisodes();
  renderTimeline();
  renderAdminRows();
  loadDashboard();
  renderNotifications();
  setCurrentEpisode(getPublishedEpisodes()[0] || episodes[0], false);
}

function hydrateTopics() {
  const topics = [...new Set([...fixedTopics, ...episodes.map((episode) => episode.topic)])].sort();
  selectors.topic.innerHTML = `<option value="">Todos los temas</option>`;
  selectors.topic.insertAdjacentHTML("beforeend", topics.map((topic) => `<option value="${topic}">${topic}</option>`).join(""));
}

function playById(id) {
  const episode = getPublishedEpisodes().find((item) => item.id === id);
  if (episode) {
    setCurrentEpisode(episode);
    document.querySelector(".listen-now").scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

document.addEventListener("click", (event) => {
  const playButton = event.target.closest("[data-play]");
  const favoriteButton = event.target.closest("[data-favorite]");
  const deleteButton = event.target.closest("[data-delete-episode]");

  if (playButton) {
    playById(playButton.dataset.play);
  }

  if (favoriteButton) {
    const id = favoriteButton.dataset.favorite;
    state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
    saveFavorites();
    renderEpisodes();

    if (state.current.id === id) {
      setCurrentEpisode(state.current, false);
    }
  }

  if (deleteButton) {
    deleteEpisode(deleteButton.dataset.deleteEpisode);
  }
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-comment-form]");

  if (!form) return;

  event.preventDefault();
  const id = form.dataset.commentForm;
  const input = form.elements.comment;
  const value = input.value.trim();

  if (!value) return;

  state.comments[id] = [...(state.comments[id] || []), value].slice(-4);
  saveComments();
  renderEpisodes();
});

document.addEventListener(
  "loadedmetadata",
  (event) => {
    if (event.target instanceof HTMLAudioElement) {
      forceNormalPlayback(event.target);
    }
  },
  true
);

document.addEventListener(
  "play",
  (event) => {
    if (event.target instanceof HTMLAudioElement) {
      forceNormalPlayback(event.target);
      const episodeId = event.target.dataset.episodeAudio;
      const episode = episodeId ? episodes.find((item) => item.id === episodeId) : state.current;
      recordPlay(episode);
    }
  },
  true
);

document.addEventListener("contextmenu", (event) => {
  if (event.target instanceof HTMLAudioElement) {
    event.preventDefault();
  }
});

document.querySelector("#primaryPlay").addEventListener("click", () => {
  selectors.audio.paused ? selectors.audio.play().catch(() => {}) : selectors.audio.pause();
});

selectors.favoriteCurrent.addEventListener("click", () => {
  const id = state.current.id;
  state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
  saveFavorites();
  setCurrentEpisode(state.current, false);
  renderEpisodes();
});

document.querySelector("#continueButton").addEventListener("click", () => {
  const [id] = Object.entries(state.progress).sort((a, b) => b[1] - a[1])[0] || [];
  playById(id || state.current.id);
});

selectors.audio.addEventListener("timeupdate", () => {
  if (selectors.audio.currentTime > 5) {
    state.progress[state.current.id] = Math.floor(selectors.audio.currentTime);
    saveProgress();
    renderNotifications();
  }
});

["input", "change"].forEach((eventName) => {
  [
    selectors.keyword,
    selectors.topic,
    selectors.petType,
    selectors.date,
    selectors.onlyInterviews,
    selectors.onlyShort,
  ].forEach((control) => control.addEventListener(eventName, renderEpisodes));
});

document.querySelector("#quickSearchButton").addEventListener("click", () => {
  selectors.keyword.value = selectors.quickSearch.value;
  renderEpisodes();
  document.querySelector("#explorar").scrollIntoView({ behavior: "smooth" });
});

selectors.quickSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    document.querySelector("#quickSearchButton").click();
  }
});

document.querySelector("#clearFilters").addEventListener("click", () => {
  selectors.keyword.value = "";
  selectors.topic.value = "";
  selectors.petType.value = "";
  selectors.date.value = "";
  selectors.onlyInterviews.checked = false;
  selectors.onlyShort.checked = false;
  renderEpisodes();
});

selectors.consultationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  selectors.consultationStatus.textContent = "";

  const formData = new FormData(event.target);
  const consultation = {
    name: formData.get("name").trim(),
    email: formData.get("email").trim(),
    pet: formData.get("pet"),
    topic: formData.get("topic").trim(),
    message: formData.get("message").trim(),
  };

  if (!consultation.name || !consultation.email || !consultation.message) {
    selectors.consultationStatus.textContent = "Completa nombre, email y consulta para enviarla.";
    return;
  }

  let consultationSaved = location.protocol === "file:";
  let consultationEmailSent = false;

  if (location.protocol !== "file:") {
    try {
      const response = await fetch("/api/consultations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(consultation),
      });
      consultationSaved = response.ok;
      if (response.ok) {
        const saved = await response.json();
        consultationEmailSent = Boolean(saved.emailSent);
      }
    } catch {
      consultationSaved = false;
    }
  }

  if (!consultationSaved) {
    selectors.consultationStatus.textContent = "No se ha podido registrar la consulta. Inténtalo de nuevo en unos segundos.";
    return;
  }

  selectors.consultationStatus.textContent = consultationEmailSent
    ? `Consulta enviada a ${consultationEmail}.`
    : `Consulta recibida. Queda registrada para ${consultationEmail}.`;
  loadDashboard();
  event.target.reset();
});

document.querySelector("#themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("petcast:theme", document.body.classList.contains("dark") ? "dark" : "light");
});

document.querySelector("#notifyButton").addEventListener("click", () => {
  renderNotifications();
  const isOpen = selectors.drawer.classList.toggle("open");
  selectors.drawer.setAttribute("aria-hidden", String(!isOpen));
});

document.querySelector("#closeNotifications").addEventListener("click", () => {
  selectors.drawer.classList.remove("open");
  selectors.drawer.setAttribute("aria-hidden", "true");
});

selectors.adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#adminEmail").value.trim().toLowerCase();
  const password = document.querySelector("#adminPassword").value;
  let canEnter = false;

  if (location.protocol !== "file:") {
    const response = await fetch("/api/admin-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (response.ok) {
      const login = await response.json();
      canEnter = login.ok;
      state.adminToken = login.token || "";
    }
  } else {
    selectors.adminLoginError.textContent = "Abre la app desde el enlace local para entrar al panel admin.";
    return;
  }

  if (email === adminCredentials.email && canEnter) {
    state.adminAuthenticated = true;
    localStorage.setItem("petcast:admin-auth", "true");
    localStorage.setItem("petcast:admin-token", state.adminToken);
    event.target.reset();
    renderAdminAccess();
    loadDashboard();
    return;
  }

  selectors.adminLoginError.textContent = "Email o contraseña incorrectos.";
});

selectors.adminLogout.addEventListener("click", () => {
  state.adminAuthenticated = false;
  state.adminToken = "";
  localStorage.removeItem("petcast:admin-auth");
  localStorage.removeItem("petcast:admin-token");
  renderAdminAccess();
});

document.querySelector("#adminForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.adminAuthenticated) {
    renderAdminAccess();
    document.querySelector("#admin").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const mediaInput = document.querySelector("#adminMedia");
  const mediaFile = mediaInput.files[0];
  const coverInput = document.querySelector("#adminCover");
  const coverFile = coverInput.files[0];
  const fallbackTitle = mediaFile
    ? mediaFile.name.replace(/\.[^/.]+$/, "").replaceAll("-", " ").replaceAll("_", " ")
    : "";
  const title = document.querySelector("#adminTitle").value.trim() || fallbackTitle;
  const description = document.querySelector("#adminDescription").value.trim();
  const topic = document.querySelector("#adminTopic").value;
  const pet = document.querySelector("#adminPet").value;
  const type = document.querySelector("#adminType").value;
  const duration = await getAudioDurationMinutes(mediaFile);
  const publishDate = document.querySelector("#publishDate").value;

  if (!title) return;

  let newEpisode;

  if (mediaFile && location.protocol !== "file:") {
    const formData = new FormData();
    formData.set("title", title);
    formData.set("description", description);
    formData.set("topic", topic);
    formData.set("pet", pet);
    formData.set("type", type);
    formData.set("duration", String(duration));
    formData.set("date", publishDate ? publishDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
    formData.set("media", mediaFile);
    if (coverFile) {
      formData.set("cover", coverFile);
    }

    const response = await fetch("/api/episodes", {
      method: "POST",
      headers: { "x-admin-token": state.adminToken },
      body: formData,
    });

    if (!response.ok) {
      alert("No se ha podido guardar el podcast. Vuelve a iniciar sesión e inténtalo de nuevo.");
      return;
    }

    newEpisode = await response.json();
  } else {
    const audioUrl = mediaFile ? URL.createObjectURL(mediaFile) : "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3";
    const coverUrl = coverFile ? URL.createObjectURL(coverFile) : pickDefaultCover(pet, title);
    newEpisode = {
    id: `ep-${Date.now()}`,
    title,
    description: description || "Nueva publicación preparada desde el panel administrador.",
    date: publishDate ? publishDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
    topic,
    pet,
    type,
    duration,
    premium: false,
    plays: 0,
    cover: coverUrl,
    audio: audioUrl,
    };
  }

  if (!episodes.some((episode) => episode.id === newEpisode.id)) {
    episodes.unshift(newEpisode);
  }

  const publishedEpisodes = getPublishedEpisodes();
  event.target.reset();
  hydrateTopics();
  renderEpisodes();
  renderTimeline();
  renderAdminRows();
  loadDashboard();
  renderNotifications();

  if (isPublished(newEpisode)) {
    setCurrentEpisode(newEpisode, false);
    document.querySelector(".listen-now").scrollIntoView({ behavior: "smooth", block: "center" });
  } else if (publishedEpisodes.length) {
    setCurrentEpisode(publishedEpisodes[0], false);
    document.querySelector("#admin").scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

async function init() {
  if (state.adminAuthenticated && !state.adminToken) {
    state.adminAuthenticated = false;
    localStorage.removeItem("petcast:admin-auth");
  }

  if (localStorage.getItem("petcast:theme") === "dark") {
    document.body.classList.add("dark");
  }

  await loadServerEpisodes();
  hydrateTopics();
  renderEpisodes();
  renderTimeline();
  renderAdminRows();
  renderAdminAccess();
  loadDashboard();
  renderNotifications();
  setCurrentEpisode(getPublishedEpisodes()[0] || episodes[0], false);
}

init();
