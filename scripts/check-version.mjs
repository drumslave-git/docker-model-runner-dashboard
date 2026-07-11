import { readFile } from "node:fs/promises";

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parseSemVer(version, source) {
  const match = SEMVER_PATTERN.exec(version);

  if (!match) {
    throw new Error(`${source} contains an invalid SemVer version: ${version}`);
  }

  return {
    raw: version,
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function compareIdentifiers(left, right) {
  const leftIsNumeric = /^\d+$/.test(left);
  const rightIsNumeric = /^\d+$/.test(right);

  if (leftIsNumeric && rightIsNumeric) {
    const leftNumber = BigInt(left);
    const rightNumber = BigInt(right);
    return leftNumber < rightNumber ? -1 : leftNumber > rightNumber ? 1 : 0;
  }

  if (leftIsNumeric !== rightIsNumeric) {
    return leftIsNumeric ? -1 : 1;
  }

  return left < right ? -1 : left > right ? 1 : 0;
}

function compareSemVer(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) {
      return left[key] < right[key] ? -1 : 1;
    }
  }

  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return left.prerelease.length === right.prerelease.length
      ? 0
      : left.prerelease.length === 0
        ? 1
        : -1;
  }

  const identifierCount = Math.max(
    left.prerelease.length,
    right.prerelease.length,
  );

  for (let index = 0; index < identifierCount; index += 1) {
    if (left.prerelease[index] === undefined) return -1;
    if (right.prerelease[index] === undefined) return 1;

    const result = compareIdentifiers(
      left.prerelease[index],
      right.prerelease[index],
    );
    if (result !== 0) return result;
  }

  return 0;
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));
const current = parseSemVer(packageJson.version, "package.json");
const lockVersions = [packageLock.version, packageLock.packages?.[""]?.version];

if (lockVersions.some((version) => version !== current.raw)) {
  throw new Error(
    `package-lock.json must use the same version as package.json (${current.raw})`,
  );
}

const previousFlag = process.argv.indexOf("--previous");
if (previousFlag !== -1) {
  const previousValue = process.argv[previousFlag + 1];
  if (!previousValue) throw new Error("--previous requires a version");

  const previous = parseSemVer(previousValue, "the previous package.json");
  if (compareSemVer(current, previous) <= 0) {
    throw new Error(
      `Version ${current.raw} must have higher SemVer precedence than ${previous.raw}`,
    );
  }
}

console.log(`Version ${current.raw} is valid and synchronized.`);
