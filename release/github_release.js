const util = require("util");
const exec = util.promisify(require("child_process").exec);

const core = require("@actions/core");

function parseLine(line) {
  const splitIdx = line.indexOf(":");

  if (splitIdx !== -1) {
    const type = logType(line.substring(0, splitIdx));
    const log = line.substring(splitIdx + 1).trim();

    return { type, log };
  }

  return { type: "Internal", log: line };
}

function logType(prefix) {
  switch (prefix) {
    case "feat":
      return "Features";
    case "fix":
      return "Fixes";
    case "deps":
      return "Dependencies";
    case "chore(release)":
      return null;
    default:
      return "Internal";
  }
}

function linkDeps(log) {
  const matches = log.match(
    /^Update (Alpha|Beta|Omega) to v?([0-9]+\.[0-9]+\.[0-9]+)$/
  );

  if (!matches) {
    // Log didn't match the expected format, ignore it
    return log;
  }

  const name = matches[1];
  const version = matches[2];

  let releaseUrl;
  switch (name) {
    case "Alpha":
      releaseUrl = `https://github.com/jansons/alpha-repo/releases/tag/v${version}`;
      break;
    case "Beta":
      releaseUrl = `https://github.com/jansons/beta-repo/releases/tag/v${version}`;
      break;
    case "Omega":
      releaseUrl = `https://github.com/jansons/omega-repo/releases/tag/v${version}`;
      break;
    default:
      // No linking support for this dependency
      return log;
  }

  return `Update ${name} to [${version}](${releaseUrl})`;
}

async function getCommits() {
  try {
    const { stdout } = await exec(
      "git log --pretty=format:%s $(git describe --abbrev=0 HEAD^).."
    );

    return stdout
      .split("\n")
      .map(parseLine)
      .filter((x) => !!x.type);
  } catch (err) {
    console.error(err.stderr);
    return [];
  }
}

function markdownChangelog(lines) {
  let body = [];

  const features = lines.filter((x) => x.type === "Features");
  if (features.length) {
    body.push("## Features");
    features.forEach(({ log }) => body.push(log));
    body.push("");
  }

  const fixes = lines.filter((x) => x.type === "Fixes");
  if (fixes.length) {
    body.push("## Fixes");
    fixes.forEach(({ log }) => body.push(log));
    body.push("");
  }

  const deps = lines.filter((x) => x.type === "Dependencies");
  if (deps.length) {
    body.push("## Dependencies");
    deps.forEach(({ log }) => body.push(linkDeps(log)));
    body.push("");
  }

  const internal = lines.filter((x) => x.type === "Internal");
  if (internal.length) {
    body.push("## Internal");
    internal.forEach(({ log }) => body.push(log));
    body.push("");
  }

  return body.join("\n").trim();
}

async function run() {
  const lines = await getCommits();
  const changelog = await markdownChangelog(lines);
  // console.log(changelog);

  const tagName = core
    .getInput("tag_name", { required: true })
    .replace("refs/tags/", "");

  const github = new GitHub(process.env.GITHUB_TOKEN);
  await github.repos.createRelease({
    tag_name: tagName,
    body: changelog,
  });
}

run();
