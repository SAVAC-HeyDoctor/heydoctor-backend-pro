#!/usr/bin/env node
/**
 * Barrido estático de rutas HTTP declaradas en *.controller.ts (Nest).
 * No ejecuta la app. Ver limitaciones en docs/NEST-ENDPOINT-HARDENING-CHECKLIST.md
 *
 * Uso:
 *   node scripts/audit-nest-routes.mjs
 *   node scripts/audit-nest-routes.mjs --json   # solo JSON a stdout
 *   node scripts/audit-nest-routes.mjs --write   # escribe docs/generated/nest-routes-raw.json
 *   node scripts/audit-nest-routes.mjs --emit-checklist   # escribe docs/NEST-ENDPOINT-HARDENING-CHECKLIST.md
 *   npm run audit:routes   # --write --emit-checklist (ver package.json)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NEST_SRC = path.join(__dirname, "..", "src");
const REPO_ROOT = path.join(__dirname, "..", "..");
const OUT_JSON = path.join(REPO_ROOT, "docs", "generated", "nest-routes-raw.json");
const GLOBAL_PREFIX = "api";

/** Clases en clinic.controller.ts que no están en ClinicModule.controllers → no registradas en runtime */
const SKIP_CLASS_IN_FILE = {
  "modules/clinic/clinic.controller.ts": new Set(["PatientsController"]),
};

function walkDir(dir, acc = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walkDir(p, acc);
    else if (name.name.endsWith(".controller.ts")) acc.push(p);
  }
  return acc;
}

function normalizeRel(filePath) {
  return path.relative(NEST_SRC, filePath).split(path.sep).join("/");
}

function joinRoute(prefix, subPath) {
  const p = (prefix || "").replace(/^\/+|\/+$/g, "");
  const s = (subPath || "").replace(/^\/+/, "");
  if (!p && !s) return "/";
  if (!p) return `/${s}`;
  if (!s) return `/${p}`;
  return `/${p}/${s}`;
}

function extractMethodSignature(lines, startIdx) {
  const parts = [];
  for (let i = startIdx; i < Math.min(startIdx + 25, lines.length); i++) {
    parts.push(lines[i]);
    if (lines[i].includes(")") && lines[i].includes("{")) break;
    if (lines[i].trim().endsWith(") {")) break;
  }
  return parts.join("\n");
}

function parseFile(absPath) {
  const rel = normalizeRel(absPath);
  const content = fs.readFileSync(absPath, "utf8");
  const lines = content.split(/\r?\n/);

  let controllerPrefix = "";
  let currentClass = "";
  const routes = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const classMatch = trimmed.match(/^export\s+class\s+(\w+)/);
    if (classMatch) {
      currentClass = classMatch[1];
      continue;
    }

    const ctrlMatch = trimmed.match(/^@Controller\(\s*(?:['"]([^'"]+)['"])?\s*\)/);
    if (ctrlMatch) {
      controllerPrefix = ctrlMatch[1] ?? "";
      continue;
    }

    const routeMatch = trimmed.match(
      /^@(Get|Post|Patch|Put|Delete)\(\s*(?:['"]([^'"]*)['"])?\s*\)/
    );
    if (!routeMatch) continue;

    const verb = routeMatch[1].toUpperCase();
    const subPath = routeMatch[2] ?? "";

    const relKey = rel.replace(/\\/g, "/");
    const skipSet = SKIP_CLASS_IN_FILE[relKey];
    if (skipSet && skipSet.has(currentClass)) {
      continue;
    }

    // Decoradores inmediatamente encima (hasta línea no @)
    let publicRoute = false;
    let j = i - 1;
    while (j >= 0) {
      const t = lines[j].trim();
      if (t === "" || t.startsWith("//")) {
        j--;
        continue;
      }
      if (t.startsWith("@Public()")) publicRoute = true;
      if (!t.startsWith("@")) break;
      j--;
    }

    // Nombre del handler
    let k = i + 1;
    while (
      k < lines.length &&
      !/^\s*(async\s+)?\w+\s*\(/.test(lines[k])
    ) {
      k++;
    }
    const nameMatch = lines[k]?.match(/^\s*(?:async\s+)?(\w+)\s*\(/);
    const handlerName = nameMatch ? nameMatch[1] : "unknown";

    const sig = extractMethodSignature(lines, k);
    const hasClinicId = /@ClinicId\s*\(\s*\)/.test(sig);

    const fullPath = joinRoute(controllerPrefix, subPath);
    routes.push({
      file: rel,
      className: currentClass,
      controllerPrefix,
      methodPath: subPath,
      verb,
      fullPath: `/${GLOBAL_PREFIX}${fullPath === "/" ? "" : fullPath}`.replace(
        /\/+/g,
        "/"
      ),
      handler: `${path.basename(absPath)}#${handlerName}`,
      public: publicRoute,
      hasClinicIdDecorator: hasClinicId,
    });
  }

  return routes;
}

/**
 * Prioridad y acciones sugeridas (heurística — revisar en revisiones de piloto).
 */
function enrichHardening(r) {
  const p = r.fullPath;
  const { verb, public: pub, hasClinicIdDecorator: cid } = r;

  let priority = "P2";
  let phi = "Bajo";
  let clinicCol = cid ? "Sí" : "No";
  let action =
    "Revisar alcance tenant y PHI según uso real; añadir auditoría si toca datos clínicos.";

  if (pub && p.includes("/webrtc/ice-servers")) {
    return {
      priority: "P0",
      phi: "N/A",
      clinicCol: "No",
      action:
        "Quitar @Public; JWT válido; ideal: credenciales TURN efímeras tras verificar participación en consulta.",
    };
  }

  if (pub && (p === "/api/ping" || p === "/api/health" || p === "/api" || p === "/api/routes")) {
    return {
      priority: "P2",
      phi: "N/A",
      clinicCol: "No",
      action:
        "Mantener sin datos clínicos; en producción restringir /api/routes si expone superficie interna.",
    };
  }

  if (pub && p.startsWith("/api/auth")) {
    return {
      priority: "P1",
      phi: "Bajo",
      clinicCol: "No",
      action:
        "Login/check deben ser públicos; añadir rate limiting, MFA roadmap, y nunca exponer detalles de usuario en errores.",
    };
  }

  if (
    p.startsWith("/api/consultations") ||
    p.startsWith("/api/diagnosis")
  ) {
    return {
      priority: "P0",
      phi: "Alto",
      clinicCol,
      action:
        "Forzar request.clinicId; verificar recurso.clinicId; listados sin query tenant libre; GET lista: reducir joins o vista ligera.",
    };
  }

  if (
    p.startsWith("/api/patients") &&
    (p === "/api/patients" || p.includes("/medical-record"))
  ) {
    const parcial = cid ? "Parcial" : "No";
    return {
      priority: "P1",
      phi: "Alto",
      clinicCol: parcial,
      action:
        "Si falta clinicId devolver 403; validar patient.clinicId === request.clinicId en medical-record y listados.",
    };
  }

  if (p.startsWith("/api/patients")) {
    return {
      priority: "P0",
      phi: "Alto",
      clinicCol: cid ? "Parcial" : "No",
      action:
        "IDOR: findOne/update/delete/create deben exigir clinicId y comprobar patient.clinicId (y rol doctor si aplica).",
    };
  }

  if (p.startsWith("/api/prescriptions") || p.startsWith("/api/lab-orders")) {
    const suggest = p.includes("suggest");
    if (suggest) {
      return {
        priority: "P1",
        phi: "Bajo",
        clinicCol: "No",
        action:
          "Acotar por clinicId/autor si el índice de sugerencias es sensible; evitar fugas entre tenants.",
      };
    }
    if (
      p.includes("/patient/") ||
      verb === "POST" ||
      cid
    ) {
      clinicCol = cid ? "Parcial" : "No";
      return {
        priority: cid && p.includes("/patient/") ? "P1" : "P0",
        phi: "Alto",
        clinicCol,
        action:
          "findOne/update/remove/findAll: verificar resource.clinicId === request.clinicId; prohibir filtros tenant solo por query.",
      };
    }
    return {
      priority: "P0",
      phi: "Alto",
      clinicCol: "No",
      action:
        "Verificar resource.clinicId en lectura/escritura; alinear con create que ya usa doctor+clinic.",
    };
  }

  if (
    p.startsWith("/api/ai-insights") ||
    p.startsWith("/api/cdss") ||
    p.startsWith("/api/copilot") ||
    p.startsWith("/api/clinical-intelligence") ||
    p.startsWith("/api/predictive-medicine")
  ) {
    return {
      priority: "P0",
      phi: "Alto",
      clinicCol: cid ? "Parcial" : "No",
      action:
        "PHI: flag desactivar IA en piloto, minimizar prompt, BAA/Azure OpenAI; persistir CDSS como sugerencia con versión modelo; auditoría.",
    };
  }

  if (p.startsWith("/api/clinical-insight")) {
    return {
      priority: "P1",
      phi: "Alto",
      clinicCol: cid ? "Parcial" : "No",
      action:
        "403 si no hay clinicId; ya filtra en servicio — unificar patrón y auditar lecturas agregadas.",
    };
  }

  if (p === "/api/clinics/me") {
    return {
      priority: "P1",
      phi: "Medio",
      clinicCol: "No",
      action:
        "Asegurar que solo expone clínica/doctor del usuario autenticado; sin enumeración cruzada.",
    };
  }

  if (p.startsWith("/api/appointments")) {
    return {
      priority: "P1",
      phi: "Alto",
      clinicCol: cid ? "Parcial" : "No",
      action:
        "403 si no hay clinicId; misma regla que consultations al migrar rutas duplicadas.",
    };
  }

  if (
    p.startsWith("/api/templates") ||
    p.startsWith("/api/favorite-orders") ||
    p.startsWith("/api/patient-reminders") ||
    p.startsWith("/api/analytics")
  ) {
    return {
      priority: "P1",
      phi: /analytics|reminders|favorite/.test(p) ? "Medio" : "Bajo",
      clinicCol: cid ? "Parcial" : "No",
      action:
        "Sustituir respuestas vacías por 403 cuando falte clinicId; verificar ownership en update/delete.",
    };
  }

  if (p.startsWith("/api/search")) {
    return {
      priority: "P1",
      phi: "Alto",
      clinicCol: cid ? "Parcial" : "No",
      action:
        "Exigir clinicId; no devolver resultados de otros tenants si clinicId undefined.",
    };
  }

  if (p.startsWith("/api/clinical-apps")) {
    return {
      priority: "P1",
      phi: "Bajo",
      clinicCol: "No",
      action:
        "Si el catálogo es global OK; si por clínica, filtrar por clinicId.",
    };
  }

  return { priority, phi, clinicCol, action };
}

function emitChecklistMd(allRoutes, controllerFileCount) {
  const enriched = allRoutes.map((r) => ({
    ...r,
    ...enrichHardening(r),
  }));

  const order = { P0: 0, P1: 1, P2: 2 };
  enriched.sort(
    (a, b) =>
      order[a.priority] - order[b.priority] || a.fullPath.localeCompare(b.fullPath)
  );

  const rows = enriched.map((r) => {
    const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
    return `| ${r.priority} | ${r.verb} | \`${r.fullPath}\` | ${r.handler} | ${r.public ? "Sí" : "No"} | ${r.clinicCol} | ${r.phi} | ${esc(r.action)} |`;
  });

  return `# Checklist de hardening — API Nest (HeyDoctor)

Este documento prioriza acciones de seguridad y compliance por **endpoint HTTP** de la API NestJS bajo el prefijo global \`/api\`.

## Alcance y exclusiones

- **Incluye:** controladores en \`nest-backend/src/**/*.controller.ts\`.
- **No incluye:** rutas **Strapi / legacy** (\`src/api/**\`, \`config/functions/websockets.js\`, etc.). Requiere checklist aparte si conviven en producción.
- **Código muerto:** en [\`nest-backend/src/modules/clinic/clinic.controller.ts\`](../nest-backend/src/modules/clinic/clinic.controller.ts) la clase \`PatientsController\` (\`@Controller('patients')\`) **no está registrada** en [\`clinic.module.ts\`](../nest-backend/src/modules/clinic/clinic.module.ts). Las rutas reales de \`/api/patients\` son las de [\`patients/patients.controller.ts\`](../nest-backend/src/modules/patients/patients.controller.ts). El barrido **omite** intencionalmente esa clase huérfana.

## Regenerar datos en bruto

\`\`\`bash
cd nest-backend && npm run audit:routes
\`\`\`

Salida JSON: [\`docs/generated/nest-routes-raw.json\`](generated/nest-routes-raw.json)

## Limitaciones del barrido automático

- No refleja el **orden de registro** de rutas de Express (colisiones \`GET :id\` vs rutas estáticas): se listan según aparición en el fichero.
- Columnas **P**, **PHI** y **Acción** usan **heurística** en el generador; revisar antes de auditorías formales.

## Verificación de conteo

- **Fuentes:** ${controllerFileCount} ficheros \`*.controller.ts\` bajo \`nest-backend/src\`.
- **Rutas en este informe:** ${allRoutes.length} (el campo \`routeCount\` en \`nest-routes-raw.json\` coincide).
- **Exclusión:** no se cuentan rutas de \`PatientsController\` en \`clinic.controller.ts\` (no registrada en \`ClinicModule\`).
- **Contraste runtime:** al levantar la app, \`nest-backend/src/main.ts\` imprime \`REGISTERED_ROUTES\`; debe alinearse con esta tabla para los mismos módulos en \`AppModule\`.

## Leyenda

| Columna | Valores |
|---------|---------|
| **P** | P0 bloquea piloto clínico serio; P1 importante; P2 mejora |
| **ClinicId** | Sí = usa \`@ClinicId()\`; Parcial = decorator o filtro parcial sin garantía en servicio; No = sin decorator |
| **PHI** | Datos de salud personales esperados en la respuesta/petición |

## Checklist por endpoint

| P | Method | Path | Handler | Public | ClinicId | PHI | Acción requerida |
|---|--------|------|---------|--------|----------|-----|------------------|
${rows.join("\n")}

---
*Generado con \`nest-backend/scripts/audit-nest-routes.mjs --emit-checklist\`. Fecha ISO: ${new Date().toISOString()}*
`;
}

function main() {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes("--json");
  const writeFile = args.includes("--write");
  const emitChecklist = args.includes("--emit-checklist");

  const files = walkDir(NEST_SRC).sort();
  const all = [];
  for (const f of files) {
    all.push(...parseFile(f));
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    globalPrefix: GLOBAL_PREFIX,
    controllerFileCount: files.length,
    routeCount: all.length,
    skippedNote:
      "PatientsController en modules/clinic/clinic.controller.ts no está registrado en ClinicModule — rutas omitidas del barrido.",
    routes: all,
  };

  if (writeFile) {
    fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
    fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2), "utf8");
    if (!jsonOnly) {
      console.error(`Wrote ${OUT_JSON}`);
    }
  }

  const CHECKLIST_MD = path.join(REPO_ROOT, "docs", "NEST-ENDPOINT-HARDENING-CHECKLIST.md");
  if (emitChecklist) {
    fs.writeFileSync(
      CHECKLIST_MD,
      emitChecklistMd(all, files.length),
      "utf8",
    );
    console.error(`Wrote ${CHECKLIST_MD}`);
  }

  if (jsonOnly) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (!writeFile && !emitChecklist) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  // Tabla Markdown breve en stdout cuando --write sin --json
  console.log("\n| Method | Path | Handler | Public | @ClinicId() |");
  console.log("|--------|------|---------|--------|-------------|");
  for (const r of all) {
    console.log(
      `| ${r.verb} | \`${r.fullPath}\` | ${r.handler} | ${r.public ? "Sí" : "No"} | ${r.hasClinicIdDecorator ? "Sí" : "No"} |`
    );
  }
  console.log(`\nTotal: ${all.length} rutas`);
}

main();
