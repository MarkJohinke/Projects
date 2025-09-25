import dotenv from "dotenv";
dotenv.config();

export function getConfig() {
  const required = [
    "DEV_NAS_HOST",
    "DEV_NAS_PORT",
    "DEV_NAS_USER",
    "PERSONAL_NAS_HOST",
    "PERSONAL_NAS_PORT",
    "PERSONAL_NAS_USER",
    "SSH_KEY_PATH",
  ];

  const missing = required.filter((k) => !process.env[k] || process.env[k] === "");
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(",")}`);
  }

  return {
    dev: {
      host: process.env.DEV_NAS_HOST,
      port: Number(process.env.DEV_NAS_PORT),
      user: process.env.DEV_NAS_USER,
      dsm: {
        baseUrl:
          process.env.DEV_DSM_URL ||
          (process.env.DEV_NAS_HOST ? `https://${process.env.DEV_NAS_HOST}:5001` : ""),
        user: process.env.DEV_DSM_USER || process.env.DEV_NAS_USER || "",
        pass: process.env.DEV_DSM_PASS || "",
      },
    },
    personal: {
      host: process.env.PERSONAL_NAS_HOST,
      port: Number(process.env.PERSONAL_NAS_PORT),
      user: process.env.PERSONAL_NAS_USER,
      dsm: {
        baseUrl:
          process.env.PERSONAL_DSM_URL ||
          (process.env.PERSONAL_NAS_HOST ? `https://${process.env.PERSONAL_NAS_HOST}:5001` : ""),
        user: process.env.PERSONAL_DSM_USER || process.env.PERSONAL_NAS_USER || "",
        pass: process.env.PERSONAL_DSM_PASS || "",
      },
    },
    // Optional third target: yoga laptop/host
    ...(process.env.YOGA_NAS_HOST
      ? {
          yoga: {
            host: process.env.YOGA_NAS_HOST,
            port: Number(process.env.YOGA_NAS_PORT || 22),
            user: process.env.YOGA_NAS_USER,
            dsm: {
              baseUrl:
                process.env.YOGA_DSM_URL ||
                (process.env.YOGA_NAS_HOST ? `https://${process.env.YOGA_NAS_HOST}:5001` : ""),
              user: process.env.YOGA_DSM_USER || process.env.YOGA_NAS_USER || "",
              pass: process.env.YOGA_DSM_PASS || "",
            },
          },
        }
      : {}),
    sshKeyPath: process.env.SSH_KEY_PATH,
    sshPasswordEnabled: process.env.SSH_PASSWORD_ENABLED === "1" || process.env.SSH_PASSWORD_ENABLED === "true",
    sshPassword: process.env.SSH_PASSWORD || "",
    apiToken: process.env.API_TOKEN || "",
    tls: {
      enabled: process.env.TLS_ENABLED === "1" || process.env.TLS_ENABLED === "true",
      keyPath: process.env.TLS_KEY_PATH || "",
      certPath: process.env.TLS_CERT_PATH || "",
      caPath: process.env.TLS_CA_PATH || "",
      requestClientCert: process.env.TLS_REQUEST_CLIENT_CERT === "1" || process.env.TLS_REQUEST_CLIENT_CERT === "true",
      rejectUnauthorized: process.env.TLS_REJECT_UNAUTHORIZED !== "0" && process.env.TLS_REJECT_UNAUTHORIZED !== "false",
    },
    dsm: {
      skipTlsVerify: process.env.DSM_SKIP_TLS_VERIFY === "1" || process.env.DSM_SKIP_TLS_VERIFY === "true",
    },
    admin: {
      logAllowPrefixes: (process.env.ADMIN_LOG_ALLOWLIST || "/var/log").split(/[;,:]/).map((s) => s.trim()).filter(Boolean),
    },
    audit: {
      enabled: process.env.AUDIT_ENABLED === "1" || process.env.AUDIT_ENABLED === "true",
      dir: process.env.AUDIT_DIR || "",
    },
    exec: {
      allowlist: (process.env.EXEC_ALLOWLIST || "").split(/[;,:]/).map((s) => s.trim()).filter(Boolean),
      denylist: (process.env.EXEC_DENYLIST || "rm,shutdown,reboot,poweroff,halt").split(/[;,:]/).map((s) => s.trim()).filter(Boolean),
    },
    local: {
      baseDir: process.env.LOCAL_BASE_DIR || process.cwd(),
      allowAbs: process.env.LOCAL_ALLOW_ABS === "1" || process.env.LOCAL_ALLOW_ABS === "true",
      allowlist: (process.env.LOCAL_ALLOWLIST || "").split(/[;,:]/).map((s) => s.trim()).filter(Boolean),
    },
  };
}
