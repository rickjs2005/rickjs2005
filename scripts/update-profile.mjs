import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [, , eventsPath = "events.json", readmePath = "README.md"] = process.argv;

const START = "<!--START_SECTION:activity-->";
const END = "<!--END_SECTION:activity-->";

const events = JSON.parse(await readFile(eventsPath, "utf8"));
const readme = await readFile(readmePath, "utf8");

const supported = new Set([
  "PushEvent",
  "CreateEvent",
  "PullRequestEvent",
  "IssuesEvent",
  "ReleaseEvent",
  "ForkEvent",
]);

const recent = events.filter((event) => supported.has(event.type)).slice(0, 5);

const date = (value) => new Date(value).toISOString().slice(0, 10);
const repoUrl = (name) => `https://github.com/${name}`;
const cleanRepo = (name) => name.replace(/^[^/]+\//, "");
const plural = (count, singular, pluralValue) =>
  count === 1 ? singular : pluralValue;

function activity(event) {
  const repo = event.repo.name;
  const payload = event.payload ?? {};

  switch (event.type) {
    case "PushEvent": {
      const count = payload.commits?.length ?? payload.size ?? 0;
      return {
        label: "PUSH",
        repo,
        detail: `${count} ${plural(count, "commit", "commits")}`,
        url: repoUrl(repo),
        createdAt: event.created_at,
      };
    }
    case "CreateEvent":
      return {
        label: "CREATE",
        repo,
        detail: payload.ref_type
          ? `${payload.ref_type}${payload.ref ? ` · ${payload.ref}` : ""}`
          : "repository",
        url: repoUrl(repo),
        createdAt: event.created_at,
      };
    case "PullRequestEvent":
      return {
        label: "PULL REQUEST",
        repo,
        detail: `#${payload.number ?? payload.pull_request?.number ?? "—"} · ${payload.action ?? "updated"}`,
        url: payload.pull_request?.html_url ?? repoUrl(repo),
        createdAt: event.created_at,
      };
    case "IssuesEvent":
      return {
        label: "ISSUE",
        repo,
        detail: `#${payload.issue?.number ?? "—"} · ${payload.action ?? "updated"}`,
        url: payload.issue?.html_url ?? repoUrl(repo),
        createdAt: event.created_at,
      };
    case "ReleaseEvent":
      return {
        label: "RELEASE",
        repo,
        detail: payload.release?.tag_name ?? payload.action ?? "published",
        url: payload.release?.html_url ?? repoUrl(repo),
        createdAt: event.created_at,
      };
    case "ForkEvent":
      return {
        label: "FORK",
        repo,
        detail: cleanRepo(payload.forkee?.full_name ?? "repository"),
        url: payload.forkee?.html_url ?? repoUrl(repo),
        createdAt: event.created_at,
      };
    default:
      return null;
  }
}

const items = recent.map(activity).filter(Boolean);

const markdown = items.length
  ? items
      .map(
        (item) =>
          `- \`${item.label}\` [${cleanRepo(item.repo)}](${item.url}) — ${item.detail} · ${date(item.createdAt)}`,
      )
      .join("\n")
  : "_Nenhuma atividade pública recente / No recent public activity._";

if (!readme.includes(START) || !readme.includes(END)) {
  throw new Error("Activity markers were not found in README.md");
}

const nextReadme = readme.replace(
  new RegExp(`${START}[\\s\\S]*?${END}`),
  `${START}\n${markdown}\n${END}`,
);

await writeFile(readmePath, nextReadme);

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const displayItems = items.slice(0, 4);
const rows = displayItems
  .map((item, index) => {
    const y = 82 + index * 38;
    const repo = cleanRepo(item.repo).slice(0, 27);
    const detail = item.detail.slice(0, 29);
    return `
      <g transform="translate(28 ${y})">
        <circle cx="5" cy="-4" r="4" fill="#36D399"/>
        <text x="22" y="0" fill="#F2B84B" font-size="11" font-weight="700" letter-spacing="1.1">${escapeXml(item.label)}</text>
        <text x="150" y="0" fill="#F4F1E8" font-size="13" font-weight="600">${escapeXml(repo)}</text>
        <text x="374" y="0" fill="#8B949E" font-size="12">${escapeXml(detail)}</text>
        <text x="620" y="0" fill="#6E7681" font-size="11">${date(item.createdAt)}</text>
      </g>`;
  })
  .join("");

const updatedAt = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="236" viewBox="0 0 760 236" role="img" aria-labelledby="title desc">
  <title id="title">Rick JS public engineering activity</title>
  <desc id="desc">Latest public GitHub events, updated automatically.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0D1117"/>
      <stop offset="1" stop-color="#111820"/>
    </linearGradient>
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M24 0H0V24" fill="none" stroke="#FFFFFF" stroke-opacity=".025"/>
    </pattern>
  </defs>
  <rect width="760" height="236" rx="16" fill="url(#bg)"/>
  <rect width="760" height="236" rx="16" fill="url(#grid)"/>
  <rect x=".5" y=".5" width="759" height="235" rx="15.5" fill="none" stroke="#30363D"/>
  <g font-family="Inter,Segoe UI,Arial,sans-serif">
    <circle cx="32" cy="31" r="5" fill="#36D399"/>
    <text x="50" y="35" fill="#F4F1E8" font-size="13" font-weight="700" letter-spacing="1.4">PUBLIC ENGINEERING SIGNAL</text>
    <text x="732" y="35" text-anchor="end" fill="#6E7681" font-size="10">${escapeXml(updatedAt)}</text>
    <path d="M28 54H732" stroke="#30363D"/>
    ${rows || '<text x="28" y="94" fill="#8B949E" font-size="13">No recent public activity</text>'}
    <text x="28" y="216" fill="#6E7681" font-size="10" letter-spacing="1.1">AUTO-GENERATED FROM GITHUB PUBLIC EVENTS</text>
  </g>
</svg>`;

const svgPath = "assets/live-status.svg";
await mkdir(dirname(svgPath), { recursive: true });
await writeFile(svgPath, svg);
