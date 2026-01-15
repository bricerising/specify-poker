import fs from "node:fs";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";

function printUsage() {
  // eslint-disable-next-line no-console
  console.log(`
Usage:
  npm run env:local [-- --force] [-- --subject=mailto:admin@localhost]

Options:
  --force                 Overwrite existing VAPID keys (and subject).
  --subject=<value>       Set VAPID_SUBJECT (default: mailto:admin@localhost).
  -h, --help              Show help.
`.trim());
}

function bufferToBase64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBuffer(base64Url) {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  return Buffer.from(padded, "base64");
}

function generateVapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

  const publicJwk = publicKey.export({ format: "jwk" });
  const privateJwk = privateKey.export({ format: "jwk" });

  const x = typeof publicJwk.x === "string" ? publicJwk.x : null;
  const y = typeof publicJwk.y === "string" ? publicJwk.y : null;
  const d = typeof privateJwk.d === "string" ? privateJwk.d : null;
  if (!x || !y || !d) {
    throw new Error("Failed to generate VAPID keys (missing JWK fields)");
  }

  const xBytes = base64UrlToBuffer(x);
  const yBytes = base64UrlToBuffer(y);
  const dBytes = base64UrlToBuffer(d);

  if (xBytes.length !== 32 || yBytes.length !== 32 || dBytes.length !== 32) {
    throw new Error("Failed to generate VAPID keys (unexpected key length)");
  }

  const uncompressedPublicKey = Buffer.concat([Buffer.from([0x04]), xBytes, yBytes]);

  return {
    publicKey: bufferToBase64Url(uncompressedPublicKey),
    privateKey: bufferToBase64Url(dBytes),
  };
}

function readEnvValue(lines, key) {
  const matcher = new RegExp(`^\\s*${key}\\s*=\\s*(.*)\\s*$`);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = matcher.exec(line);
    if (match) {
      return match[1]?.trim() ?? "";
    }
  }
  return null;
}

function isManagedKeyLine(line, managedKeys) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return false;
  }

  for (const key of managedKeys) {
    const matcher = new RegExp(`^\\s*${key}\\s*=`);
    if (matcher.test(line)) {
      return true;
    }
  }
  return false;
}

function stripBlankLinesBetweenManagedKeys(lines, managedKeys) {
  const nextNonBlank = (startIndex) => {
    for (let i = startIndex; i < lines.length; i++) {
      if (lines[i]?.trim() !== "") {
        return lines[i];
      }
    }
    return null;
  };

  const prevNonBlankInResult = (result) => {
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i]?.trim() !== "") {
        return result[i];
      }
    }
    return null;
  };

  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      const prevNonBlank = prevNonBlankInResult(result);
      const nextNonBlankLine = nextNonBlank(i + 1);
      if (
        prevNonBlank
        && nextNonBlankLine
        && isManagedKeyLine(prevNonBlank, managedKeys)
        && isManagedKeyLine(nextNonBlankLine, managedKeys)
      ) {
        continue;
      }
    }
    result.push(line);
  }

  while (result.length && result[0]?.trim() === "") {
    result.shift();
  }

  return result;
}

function upsertEnvValue(lines, key, value) {
  const matcher = new RegExp(`^\\s*${key}\\s*=`);
  const indexes = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    if (matcher.test(line)) {
      indexes.push(index);
    }
  });

  const nextLines = [...lines];
  if (indexes.length === 0) {
    while (nextLines.length && nextLines[nextLines.length - 1]?.trim() === "") {
      nextLines.pop();
    }
    nextLines.push(`${key}=${value}`);
    return nextLines;
  }

  nextLines[indexes[0]] = `${key}=${value}`;
  for (const index of indexes.slice(1)) {
    nextLines[index] = null;
  }
  return nextLines.filter((line) => line !== null);
}

function parseArgs(argv) {
  const options = {
    force: false,
    subject: null,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg.startsWith("--subject=")) {
      options.subject = arg.slice("--subject=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const managedKeys = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"];
  const envPath = path.resolve(process.cwd(), ".env");
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = existing.split(/\r?\n/);

  const currentPublic = readEnvValue(lines, "VAPID_PUBLIC_KEY");
  const currentPrivate = readEnvValue(lines, "VAPID_PRIVATE_KEY");
  const currentSubject = readEnvValue(lines, "VAPID_SUBJECT");

  const wantsKeys = options.force || !currentPublic || !currentPrivate;
  const wantsSubject = options.force || options.subject !== null || !currentSubject;

  let nextLines = [...lines];
  let rotatedKeys = false;

  const outputPublicKey = wantsKeys ? null : currentPublic;
  const outputPrivateKey = wantsKeys ? null : currentPrivate;
  const outputSubject = wantsSubject ? null : currentSubject;

  if (wantsKeys) {
    if (!options.force && (currentPublic || currentPrivate)) {
      rotatedKeys = true;
    }
    const keys = generateVapidKeys();
    nextLines = upsertEnvValue(nextLines, "VAPID_PUBLIC_KEY", keys.publicKey);
    nextLines = upsertEnvValue(nextLines, "VAPID_PRIVATE_KEY", keys.privateKey);
  } else if (outputPublicKey && outputPrivateKey) {
    nextLines = upsertEnvValue(nextLines, "VAPID_PUBLIC_KEY", outputPublicKey);
    nextLines = upsertEnvValue(nextLines, "VAPID_PRIVATE_KEY", outputPrivateKey);
  }

  if (wantsSubject) {
    const subject = options.subject ?? currentSubject ?? "mailto:admin@localhost";
    nextLines = upsertEnvValue(nextLines, "VAPID_SUBJECT", subject);
  } else if (outputSubject) {
    nextLines = upsertEnvValue(nextLines, "VAPID_SUBJECT", outputSubject);
  }

  nextLines = stripBlankLinesBetweenManagedKeys(nextLines, managedKeys);

  const output = `${nextLines.join("\n").replace(/\n+$/g, "")}\n`;

  if (output === existing) {
    // eslint-disable-next-line no-console
    console.log(`No changes: ${envPath} is already up to date.`);
    return;
  }

  fs.writeFileSync(envPath, output, "utf8");

  const formattingOnly = !wantsKeys && !wantsSubject;

  // eslint-disable-next-line no-console
  console.log(
    [
      `Wrote ${envPath}`,
      wantsKeys ? `- VAPID keys: ${rotatedKeys ? "regenerated (incomplete prior config)" : "generated"}` : null,
      wantsSubject ? "- VAPID subject: set" : null,
      formattingOnly ? "- Formatting: removed extra blank lines" : null,
      "Tip: re-run with `-- --force` to rotate keys.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

main();
