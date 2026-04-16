const state = {
  adminToken: localStorage.getItem("kori.adminToken") ?? "",
  sessionToken: localStorage.getItem("kori.sessionToken") ?? "",
  socket: null
};

const elements = {
  authForm: document.querySelector("#auth-form"),
  email: document.querySelector("#email"),
  password: document.querySelector("#password"),
  loginButton: document.querySelector("#login-button"),
  adminToken: document.querySelector("#admin-token"),
  overview: document.querySelector("#overview-output"),
  devices: document.querySelector("#devices-output"),
  logs: document.querySelector("#logs-output"),
  audit: document.querySelector("#audit-output"),
  workspaces: document.querySelector("#workspaces-output"),
  notes: document.querySelector("#notes-output"),
  deadlines: document.querySelector("#deadlines-output"),
  recommendations: document.querySelector("#recommendations-output"),
  telemetry: document.querySelector("#telemetry-output"),
  provisionForm: document.querySelector("#provision-form"),
  provisionOutput: document.querySelector("#provision-output"),
  noteForm: document.querySelector("#note-form"),
  deadlineForm: document.querySelector("#deadline-form"),
  recommendationForm: document.querySelector("#recommendation-form"),
  requestForm: document.querySelector("#request-form"),
  requestOutput: document.querySelector("#request-output"),
  spotifyOutput: document.querySelector("#spotify-output"),
  spotifyUserId: document.querySelector("#spotify-user-id"),
  spotifyStatusButton: document.querySelector("#spotify-status-button"),
  spotifyPresenceButton: document.querySelector("#spotify-presence-button"),
  telemetryHours: document.querySelector("#telemetry-hours"),
  telemetryBuckets: document.querySelector("#telemetry-buckets"),
  telemetryRefreshButton: document.querySelector("#telemetry-refresh-button"),
  telemetryEnableButton: document.querySelector("#telemetry-enable-button")
};

if (elements.adminToken) {
  elements.adminToken.value = state.adminToken;
}

function authHeaders(extra = {}) {
  return {
    ...(state.sessionToken ? { "x-kori-session": state.sessionToken } : {}),
    ...(state.adminToken ? { "x-kori-admin-key": state.adminToken } : {}),
    ...extra
  };
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...authHeaders(options.headers ?? {})
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(pretty(body));
  }

  return body;
}

async function refreshOverview() {
  elements.overview.textContent = pretty(await api("/v1/admin/overview"));
}

async function refreshDevices() {
  elements.devices.textContent = pretty(await api("/v1/admin/devices"));
}

async function refreshLogs() {
  elements.logs.textContent = pretty(await api("/v1/admin/logs?limit=100"));
}

async function refreshAudit() {
  elements.audit.textContent = pretty(await api("/v1/admin/audit?limit=100"));
}

async function refreshSpotifyStatus() {
  const userId = elements.spotifyUserId.value.trim();
  elements.spotifyOutput.textContent = pretty(
    await api(`/v1/integrations/spotify/status?userId=${encodeURIComponent(userId)}`)
  );
}

async function refreshWorkspaces() {
  elements.workspaces.textContent = pretty(await api("/v1/workspaces"));
}

async function refreshNotes() {
  elements.notes.textContent = pretty(await api("/v1/notes"));
}

async function refreshDeadlines() {
  elements.deadlines.textContent = pretty(await api("/v1/deadlines"));
}

async function refreshRecommendations() {
  elements.recommendations.textContent = pretty(await api("/v1/recommendations"));
}

async function refreshTelemetry() {
  const hours = elements.telemetryHours.value.trim();
  const bucketMinutes = elements.telemetryBuckets.value.trim();
  elements.telemetry.textContent = pretty(
    await api(`/v1/admin/telemetry?hours=${encodeURIComponent(hours)}&bucketMinutes=${encodeURIComponent(bucketMinutes)}`)
  );
}

async function refreshAll() {
  await Promise.all([
    refreshOverview(),
    refreshDevices(),
    refreshLogs(),
    refreshAudit(),
    refreshWorkspaces(),
    refreshNotes(),
    refreshDeadlines(),
    refreshRecommendations(),
    refreshTelemetry()
  ]);
}

function connectSocket() {
  if (state.socket) {
    state.socket.close();
  }

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(
    `${protocol}//${location.host}/v1/ws/session?stream=admin&adminToken=${encodeURIComponent(state.adminToken)}&sessionToken=${encodeURIComponent(state.sessionToken)}`
  );
  state.socket = socket;

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "admin:overview") {
      elements.overview.textContent = pretty(payload.payload);
    } else if (payload.type === "admin:device_state") {
      refreshDevices().catch((error) => {
        elements.devices.textContent = error.message;
      });
    } else if (payload.type === "admin:log") {
      refreshLogs().catch((error) => {
        elements.logs.textContent = error.message;
      });
    } else if (payload.type === "admin:audit") {
      refreshAudit().catch((error) => {
        elements.audit.textContent = error.message;
      });
    } else if (payload.type === "admin:spotify_presence") {
      elements.spotifyOutput.textContent = pretty(payload.payload);
    }
  });

  socket.addEventListener("close", () => {
    state.socket = null;
  });
}

elements.authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.adminToken = elements.adminToken.value.trim();
  localStorage.setItem("kori.adminToken", state.adminToken);

  try {
    await refreshAll();
    connectSocket();
  } catch (error) {
    elements.overview.textContent = error.message;
  }
});

elements.loginButton?.addEventListener("click", async () => {
  try {
    const session = await api("/v1/auth/login", {
      method: "POST",
      headers: state.adminToken ? { "x-kori-admin-key": state.adminToken } : {},
      body: JSON.stringify({
        email: elements.email.value.trim(),
        password: elements.password.value
      })
    });
    state.sessionToken = session.sessionToken;
    localStorage.setItem("kori.sessionToken", state.sessionToken);
    await refreshAll();
    connectSocket();
  } catch (error) {
    elements.overview.textContent = error.message;
  }
});

elements.provisionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(elements.provisionForm);
  const payload = Object.fromEntries(form.entries());
  payload.expiresInSec = Number(payload.expiresInSec);
  elements.provisionOutput.textContent = pretty(
    await api("/v1/admin/provisioning-codes", {
      method: "POST",
      body: JSON.stringify(payload)
    })
  );
});

elements.noteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(elements.noteForm).entries());
  elements.notes.textContent = pretty(
    await api("/v1/notes", {
      method: "POST",
      body: JSON.stringify(payload)
    })
  );
});

elements.deadlineForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(elements.deadlineForm).entries());
  payload.metadata = JSON.parse(String(payload.metadata));
  elements.deadlines.textContent = pretty(
    await api("/v1/deadlines", {
      method: "POST",
      body: JSON.stringify(payload)
    })
  );
});

elements.recommendationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(elements.recommendationForm).entries());
  elements.recommendations.textContent = pretty(
    await api("/v1/recommendations", {
      method: "POST",
      body: JSON.stringify(payload)
    })
  );
});

elements.requestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(elements.requestForm);
  const path = String(form.get("path"));
  const method = String(form.get("method"));
  const rawBody = String(form.get("body") || "").trim();
  const body = rawBody ? JSON.stringify(JSON.parse(rawBody)) : undefined;
  elements.requestOutput.textContent = pretty(
    await api(path, {
      method,
      ...(body ? { body } : {})
    })
  );
});

elements.spotifyStatusButton?.addEventListener("click", () => {
  refreshSpotifyStatus().catch((error) => {
    elements.spotifyOutput.textContent = error.message;
  });
});

elements.spotifyPresenceButton?.addEventListener("click", async () => {
  try {
    const userId = elements.spotifyUserId.value.trim();
    elements.spotifyOutput.textContent = pretty(
      await api(`/v1/integrations/spotify/presence?userId=${encodeURIComponent(userId)}`, {
        method: "POST",
        body: JSON.stringify({ userId })
      })
    );
  } catch (error) {
    elements.spotifyOutput.textContent = error.message;
  }
});

elements.telemetryRefreshButton?.addEventListener("click", () => {
  refreshTelemetry().catch((error) => {
    elements.telemetry.textContent = error.message;
  });
});

elements.telemetryEnableButton?.addEventListener("click", async () => {
  try {
    elements.telemetry.textContent = pretty(
      await api("/v1/admin/telemetry/enable-timescale", {
        method: "POST"
      })
    );
  } catch (error) {
    elements.telemetry.textContent = error.message;
  }
});

document.querySelectorAll("[data-refresh]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.getAttribute("data-refresh");
    const runner =
      action === "devices" ? refreshDevices :
      action === "logs" ? refreshLogs :
      action === "audit" ? refreshAudit :
      action === "workspaces" ? refreshWorkspaces :
      action === "notes" ? refreshNotes :
      action === "deadlines" ? refreshDeadlines :
      action === "recommendations" ? refreshRecommendations :
      refreshOverview;

    runner().catch((error) => {
      const target =
        action === "devices" ? elements.devices :
        action === "logs" ? elements.logs :
        action === "audit" ? elements.audit :
        action === "workspaces" ? elements.workspaces :
        action === "notes" ? elements.notes :
        action === "deadlines" ? elements.deadlines :
        action === "recommendations" ? elements.recommendations :
        elements.overview;
      target.textContent = error.message;
    });
  });
});

if (state.adminToken || state.sessionToken) {
  refreshAll()
    .then(() => {
      connectSocket();
    })
    .catch((error) => {
      elements.overview.textContent = error.message;
    });
}
