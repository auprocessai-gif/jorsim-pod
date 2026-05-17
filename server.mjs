import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, join, normalize, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 8080);
const uploadsDir = join(root, "uploads");
const dataDir = join(root, "data");

function loadLocalEnv() {
  [".env.local", ".env"].forEach((file) => {
    const envPath = join(root, file);
    if (!existsSync(envPath)) return;

    readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .forEach((line) => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
        if (!match || process.env[match[1]]) return;
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      });
  });
}

loadLocalEnv();

const episodesFile = join(dataDir, "episodes.json");
const consultationsFile = join(dataDir, "consultas.json");
const analyticsFile = join(dataDir, "analytics.json");
const adminEmail = "mariola@auladeformadores.com";
const consultationEmail = process.env.CONSULTATION_EMAIL || "mariola@auladeformadores.com";
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseEnabled = Boolean(supabaseUrl && supabaseServiceKey);
const supabaseTables = {
  episodes: "jorsim_episodes",
  consultations: "jorsim_consultations",
  analytics: "jorsim_analytics_events",
};
const storageBuckets = {
  audio: "episode-audio",
  covers: "episode-covers",
};
const adminPasswordHash = "07d7fa3edb4ec5f179b4150dffe22bfd2f88a10378ab4b05fd76a4a13c14ecd5";
const defaultCovers = {
  Gatos: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=900&q=80",
  Perros: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=900&q=80",
  "Perros y gatos": "https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=900&q=80",
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

function sendJson(res, status, body) {
  send(res, status, JSON.stringify(body), "application/json; charset=utf-8");
}

function isProtectedMediaRequest(req, pathname) {
  if (!pathname.startsWith("/uploads/")) return false;

  const extension = extname(pathname).toLowerCase();
  const protectedExtensions = new Set([".mp3", ".mpeg", ".mp4", ".m4a", ".wav", ".ogg", ".webm"]);
  if (!protectedExtensions.has(extension)) return false;

  const destination = req.headers["sec-fetch-dest"] || "";
  return !["audio", "video"].includes(destination);
}

function readEpisodes() {
  if (!existsSync(episodesFile)) return [];

  try {
    return JSON.parse(readFileSync(episodesFile, "utf8"));
  } catch {
    return [];
  }
}

function writeEpisodes(episodes) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(episodesFile, JSON.stringify(episodes, null, 2));
}

function readConsultations() {
  if (!existsSync(consultationsFile)) return [];

  try {
    return JSON.parse(readFileSync(consultationsFile, "utf8"));
  } catch {
    return [];
  }
}

function writeConsultations(consultations) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(consultationsFile, JSON.stringify(consultations, null, 2));
}

function readAnalytics() {
  if (!existsSync(analyticsFile)) return [];

  try {
    return JSON.parse(readFileSync(analyticsFile, "utf8"));
  } catch {
    return [];
  }
}

function writeAnalytics(events) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(analyticsFile, JSON.stringify(events, null, 2));
}

async function supabaseRequest(pathname, options = {}) {
  if (!supabaseEnabled) return null;

  const response = await fetch(`${supabaseUrl}${pathname}`, {
    ...options,
    headers: {
      apikey: supabaseServiceKey,
      authorization: `Bearer ${supabaseServiceKey}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Supabase ${response.status}: ${details}`);
  }

  if (response.status === 204) return null;

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function createSignedStorageUrl(bucket, path) {
  if (!path || /^https?:\/\//.test(path) || path.startsWith("/uploads/")) return path;

  const cleanPath = path.replace(new RegExp(`^${bucket}/`), "");
  const signed = await supabaseRequest(`/storage/v1/object/sign/${bucket}/${encodeURIComponent(cleanPath)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: 3600 }),
  });

  const signedUrl = signed?.signedURL || signed?.signedUrl;
  return signedUrl?.startsWith("http") ? signedUrl : `${supabaseUrl}${signedUrl}`;
}

function toStoredFileName(filename) {
  return `${Date.now()}-${filename.replace(/[^\w.-]+/g, "-")}`;
}

async function uploadToSupabaseStorage(bucket, filename, file) {
  const storedName = toStoredFileName(filename);
  await supabaseRequest(`/storage/v1/object/${bucket}/${encodeURIComponent(storedName)}`, {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-upsert": "false",
    },
    body: file.body,
  });
  return storedName;
}

async function normalizeSupabaseEpisode(row) {
  const audio = await createSignedStorageUrl(storageBuckets.audio, row.audio_path);
  const cover = await createSignedStorageUrl(storageBuckets.covers, row.cover_path);

  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    date: (row.publish_date || row.created_at || new Date().toISOString()).slice(0, 10),
    topic: row.topic,
    pet: row.pet,
    type: row.type,
    duration: Number(row.duration_minutes) || 26,
    premium: Boolean(row.is_premium),
    plays: Number(row.plays) || 0,
    cover: cover || defaultCovers[row.pet] || defaultCovers["Perros y gatos"],
    audio,
  };
}

async function readEpisodesFromSupabase() {
  const rows = await supabaseRequest(
    `/rest/v1/${supabaseTables.episodes}?select=*&order=publish_date.desc,created_at.desc`
  );
  return Promise.all((rows || []).map(normalizeSupabaseEpisode));
}

async function readConsultationsFromSupabase() {
  const rows = await supabaseRequest(
    `/rest/v1/${supabaseTables.consultations}?select=*&order=created_at.desc&limit=100`
  );
  return (rows || []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    email: row.email,
    pet: row.pet,
    topic: row.topic,
    message: row.message,
    to: row.sent_to,
  }));
}

async function recordAnalyticsEvent(event) {
  if (supabaseEnabled) {
    await supabaseRequest(`/rest/v1/${supabaseTables.analytics}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        event_type: event.type,
        episode_id: event.episodeId || null,
        episode_title: event.episodeTitle || null,
        topic: event.topic || null,
        pet: event.pet || null,
        user_agent: event.userAgent || null,
      }),
    });
    return;
  }

  const events = readAnalytics();
  events.unshift({
    id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: new Date().toISOString(),
    ...event,
  });
  writeAnalytics(events.slice(0, 5000));
}

async function readAnalyticsEvents() {
  if (!supabaseEnabled) return readAnalytics();

  const rows = await supabaseRequest(
    `/rest/v1/${supabaseTables.analytics}?select=*&order=created_at.desc&limit=5000`
  );
  return (rows || []).map((row) => ({
    id: row.id,
    at: row.created_at,
    type: row.event_type,
    episodeId: row.episode_id,
    episodeTitle: row.episode_title,
    topic: row.topic,
    pet: row.pet,
  }));
}

async function buildDashboard() {
  const events = await readAnalyticsEvents();
  const consultations = supabaseEnabled ? await readConsultationsFromSupabase() : readConsultations();
  const episodes = supabaseEnabled ? await readEpisodesFromSupabase() : readEpisodes();
  const plays = events.filter((event) => event.type === "episode_play");
  const topicCounts = {};
  const episodeCounts = {};

  plays.forEach((event) => {
    const topic = event.topic || "Sin tema";
    const title = event.episodeTitle || "Episodio sin título";
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    episodeCounts[title] = (episodeCounts[title] || 0) + 1;
  });

  return {
    totals: {
      plays: plays.length,
      consultations: consultations.length,
      published: episodes.filter((episode) => !episode.date || episode.date <= new Date().toISOString().slice(0, 10)).length,
      scheduled: episodes.filter((episode) => episode.date && episode.date > new Date().toISOString().slice(0, 10)).length,
    },
    topics: Object.entries(topicCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    episodes: Object.entries(episodeCounts)
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    recentConsultations: consultations.slice(0, 5),
  };
}

function readRequest(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseJsonBody(buffer) {
  try {
    return JSON.parse(buffer.toString("utf8") || "{}");
  } catch {
    return null;
  }
}

function parseMultipart(buffer, contentType) {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[2];
  if (!boundary) return { fields: {}, files: {} };

  const fields = {};
  const files = {};
  const delimiter = Buffer.from(`--${boundary}`);
  let cursor = buffer.indexOf(delimiter);

  while (cursor !== -1) {
    const next = buffer.indexOf(delimiter, cursor + delimiter.length);
    if (next === -1) break;

    const part = buffer.subarray(cursor + delimiter.length + 2, next - 2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd > -1) {
      const header = part.subarray(0, headerEnd).toString("utf8");
      const body = part.subarray(headerEnd + 4);
      const name = header.match(/name="([^"]+)"/)?.[1];
      const filename = header.match(/filename="([^"]*)"/)?.[1];
      const type = header.match(/content-type:\s*([^\r\n]+)/i)?.[1] || "application/octet-stream";

      if (name && filename) {
        files[name] = { filename: basename(filename), type, body };
      } else if (name) {
        fields[name] = body.toString("utf8");
      }
    }

    cursor = next;
  }

  return { fields, files };
}

export async function handleApiRequest(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    send(res, 204, "");
    return;
  }

  if (url.pathname === "/api/episodes" && req.method === "GET") {
    try {
      sendJson(res, 200, supabaseEnabled ? await readEpisodesFromSupabase() : readEpisodes());
    } catch {
      sendJson(res, 200, readEpisodes());
    }
    return;
  }

  if (url.pathname === "/api/dashboard" && req.method === "GET") {
    try {
      sendJson(res, 200, await buildDashboard());
    } catch {
      sendJson(res, 200, {
        totals: { plays: 0, consultations: 0, published: 0, scheduled: 0 },
        topics: [],
        episodes: [],
        recentConsultations: [],
      });
    }
    return;
  }

  if (url.pathname === "/api/analytics" && req.method === "POST") {
    const body = await readRequest(req);
    const event = parseJsonBody(body);

    if (!event || !event.type) {
      sendJson(res, 400, { error: "Evento no valido." });
      return;
    }

    try {
      await recordAnalyticsEvent({
        type: event.type,
        episodeId: event.episodeId || "",
        episodeTitle: event.episodeTitle || "",
        topic: event.topic || "",
        pet: event.pet || "",
        userAgent: req.headers["user-agent"] || "",
      });
    } catch {
      // Analytics should not interrupt playback.
    }
    sendJson(res, 201, { ok: true });
    return;
  }

  if (url.pathname === "/api/admin-login" && req.method === "POST") {
    const body = await readRequest(req);
    const credentials = parseJsonBody(body);

    if (!credentials) {
      sendJson(res, 400, { error: "JSON no valido." });
      return;
    }

    const { email = "", password = "" } = credentials;
    const passwordHash = createHash("sha256").update(password).digest("hex");

    sendJson(res, 200, {
      ok: email.trim().toLowerCase() === adminEmail && passwordHash === adminPasswordHash,
    });
    return;
  }

  if (url.pathname === "/api/consultations" && req.method === "POST") {
    const body = await readRequest(req);
    const consultation = parseJsonBody(body);

    if (!consultation) {
      sendJson(res, 400, { error: "JSON no valido." });
      return;
    }

    const saved = {
      id: `consult-${Date.now()}`,
      createdAt: new Date().toISOString(),
      name: consultation.name || "",
      email: consultation.email || "",
      pet: consultation.pet || "",
      topic: consultation.topic || "",
      message: consultation.message || "",
      to: consultationEmail,
    };
    try {
      if (supabaseEnabled) {
        await supabaseRequest(`/rest/v1/${supabaseTables.consultations}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            prefer: "return=minimal",
          },
          body: JSON.stringify({
            name: saved.name,
            email: saved.email,
            pet: saved.pet,
            topic: saved.topic,
            message: saved.message,
            sent_to: saved.to,
          }),
        });
      } else {
        const consultations = readConsultations();
        consultations.unshift(saved);
        writeConsultations(consultations);
      }
    } catch {
      sendJson(res, 500, { error: "No se ha podido registrar la consulta." });
      return;
    }

    try {
      await recordAnalyticsEvent({
        type: "consultation_submitted",
        topic: saved.topic,
        pet: saved.pet,
        userAgent: req.headers["user-agent"] || "",
      });
    } catch {
      // Consultations are saved even if analytics are unavailable.
    }
    sendJson(res, 201, saved);
    return;
  }

  if (url.pathname === "/api/episodes" && req.method === "POST") {
    const body = await readRequest(req);
    const { fields, files } = parseMultipart(body, req.headers["content-type"] || "");
    const media = files.media;
    const cover = files.cover;

    if (!media) {
      sendJson(res, 400, { error: "Falta el archivo de audio." });
      return;
    }

    if (!media.type.startsWith("audio/")) {
      sendJson(res, 400, { error: "Por ahora solo se admiten archivos de audio." });
      return;
    }

    const safeName = media.filename.replace(/[^\w.-]+/g, "-");
    let storedName;

    try {
    if (supabaseEnabled) {
      storedName = await uploadToSupabaseStorage(storageBuckets.audio, safeName, media);
    } else {
      storedName = toStoredFileName(safeName);
      writeFileSync(join(uploadsDir, storedName), media.body);
    }

    let coverUrl = defaultCovers[fields.pet] || defaultCovers["Perros y gatos"];
    if (cover && cover.type.startsWith("image/")) {
      const safeCoverName = cover.filename.replace(/[^\w.-]+/g, "-");
      if (supabaseEnabled) {
        coverUrl = await uploadToSupabaseStorage(storageBuckets.covers, safeCoverName, cover);
      } else {
        const storedCoverName = toStoredFileName(safeCoverName);
        writeFileSync(join(uploadsDir, storedCoverName), cover.body);
        coverUrl = `/uploads/${storedCoverName}`;
      }
    }

    const episode = {
      id: `local-${Date.now()}`,
      title: fields.title || safeName.replace(/\.[^/.]+$/, "").replaceAll("-", " "),
      description: fields.description || "Nueva publicación preparada desde el panel administrador.",
      date: fields.date || new Date().toISOString().slice(0, 10),
      topic: fields.topic || "Nutrición",
      pet: fields.pet || "Perros",
      type: fields.type || "Podcast",
      duration: Number(fields.duration) || 26,
      premium: false,
      plays: 0,
      cover: coverUrl,
      audio: supabaseEnabled ? storedName : `/uploads/${storedName}`,
    };

    if (supabaseEnabled) {
      const rows = await supabaseRequest(`/rest/v1/${supabaseTables.episodes}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify({
          title: episode.title,
          description: episode.description,
          publish_date: episode.date,
          topic: episode.topic,
          pet: episode.pet,
          type: episode.type,
          duration_minutes: episode.duration,
          audio_path: storedName,
          cover_path: coverUrl,
          is_premium: false,
        }),
      });
      sendJson(res, 201, await normalizeSupabaseEpisode(rows[0]));
    } else {
      const episodes = readEpisodes();
      episodes.unshift(episode);
      writeEpisodes(episodes);
      sendJson(res, 201, episode);
    }
    } catch {
      sendJson(res, 500, { error: "No se ha podido guardar el audio." });
    }
    return;
  }

  sendJson(res, 404, { error: "Ruta API no encontrada." });
}

function startLocalServer() {
  mkdirSync(uploadsDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });

  createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApiRequest(req, res);
      return;
    }

    const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);

  if (isProtectedMediaRequest(req, requested)) {
    send(res, 403, "Protected media");
    return;
  }

  const filePath = normalize(join(root, requested));

  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    send(res, 404, "Not found");
    return;
  }

  res.writeHead(200, {
    "content-type": types[extname(filePath).toLowerCase()] || "application/octet-stream",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "content-disposition": "inline",
    "x-content-type-options": "nosniff",
  });
  createReadStream(filePath).pipe(res);
  }).listen(port, () => {
    console.log(`Jorsim Pod disponible en http://localhost:${port}`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startLocalServer();
}
