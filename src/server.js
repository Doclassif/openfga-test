import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { check, batchCheck, listObjects, listUsers } from "./client.js";
import { parseCsv } from "./import.js";
import { traceResolutionPath } from "./graph-tracer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MODEL_JSON_PATH = join(__dirname, "../model.json");
const MODEL_FGA_PATH = join(__dirname, "../model.fga");

export { traceResolutionPath };

const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Читаем все 6 таблиц
const tables = {
  divisions: parseCsv("./csv/divisions.csv"),
  professions: parseCsv("./csv/professions.csv"),
  staffs: parseCsv("./csv/staffs.csv"),
  employees: parseCsv("./csv/employees.csv"),
  replacings: parseCsv("./csv/replacings.csv"),
  roles: parseCsv("./csv/roles.csv")
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export async function resolveAccessDetails(user, relation, object, allowed, ctx) {
  let source = allowed ? "direct" : "none";
  let breakdown = null;
  let substitution = null;
  let explanation = allowed ? "Результат OpenFGA: Разрешено (allowed: true)" : "Результат OpenFGA: Запрещено (allowed: false)";

  try {
    // 1. Проверка прав на Роли (Roles)
    if (object.startsWith("Roles:")) {
      if (relation === "assignee" || relation === "can_use") {
        const rawUser = user.replace("Employees:", "");
        const rawObject = object.replace("Roles:", "");
        const [isDirect, isSub] = await Promise.all([
          check(user, "direct_assignee", object, ctx),
          check(user, "substitute_assignee", object, ctx)
        ]);
        breakdown = { direct: isDirect, substitute: isSub };

        if (allowed) {
          if (isSub && !isDirect) {
            source = "substitute";
          } else if (isDirect && !isSub) {
            source = "direct";
          } else if (isDirect && isSub) {
            source = "direct+substitute";
          }

          if (isSub) {
            const [replaced, directReplaced] = await Promise.all([
              listUsers(user, "replaces", "Employees"),
              listUsers(user, "direct_replaces", "Employees")
            ]);
            const replacedInfo = [];
            for (const rId of replaced) {
              const rHas = await check(`Employees:${rId}`, "direct_assignee", object, ctx);
              if (rHas) {
                const isLevel1 = directReplaced.includes(rId);
                const empData = (tables.employees || []).find(e => e.username === rId);
                replacedInfo.push({
                  username: rId,
                  full_name: empData?.full_name || `Сотрудник ${rId}`,
                  level: isLevel1 ? 1 : 2
                });
              }
            }
            const hasChain = replacedInfo.some(r => r.level > 1);
            substitution = {
              is_substitute: true,
              is_chain: hasChain,
              replaced_users: replacedInfo,
              reason: replacedInfo.length > 0
                ? (hasChain 
                    ? `Сотрудник ${rawUser} получает доступ по цепочке замещений (уровень 2+): через ${replacedInfo.map(r => `${r.username} (${r.full_name})`).join(", ")}`
                    : `Сотрудник ${rawUser} замещает ${replacedInfo.map(r => `${r.username} (${r.full_name})`).join(", ")}, которому роль назначена напрямую`)
                : `Сотрудник ${rawUser} унаследовал роль через замещение`
            };
            explanation = hasChain
              ? `✓ ДОСТУП ПО ЦЕПОЧКЕ ЗАМЕЩЕНИЙ: ${substitution.reason}`
              : `✓ ДОСТУП РАЗРЕШЕН ПО ЗАМЕЩЕНИЮ: ${substitution.reason}`;
          } else if (isDirect) {
            explanation = "✓ ДОСТУП РАЗРЕШЕН НАПРЯМУЮ: Роль назначена сотруднику лично.";
          }
        } else {
          explanation = "✗ ДОСТУП ЗАПРЕЩЕН: Роль не назначена сотруднику лично, отсутствует у замещаемых им сотрудников.";
        }
      } else if (relation === "direct_assignee") {
        if (!allowed) {
          explanation = "✗ ПРЯМОЙ ДОСТУП ЗАПРЕЩЕН: Роль не назначена сотруднику лично (может быть доступна только по замещению).";
        } else {
          explanation = "✓ ПРЯМОЙ ДОСТУП РАЗРЕШЕН: Роль назначена сотруднику лично.";
        }
      } else if (relation === "substitute_assignee") {
        if (allowed) {
          source = "substitute";
          explanation = "✓ ДОСТУП ПО ЗАМЕЩЕНИЮ: Сотрудник является замещающим обладателя этой роли.";
        } else {
          explanation = "✗ ЗАМЕЩЕНИЕ ОТСУТСТВУЕТ: Сотрудник не замещает ни одного обладателя этой роли.";
        }
      }
    }

    // 2. Проверка подразделений (Divisions)
    else if (object.startsWith("Divisions:")) {
      if (relation === "employee" || relation === "can_use") {
        const [isDirect, isSub] = await Promise.all([
          check(user, "direct_employee", object, ctx),
          check(user, "substitute_employee", object, ctx)
        ]);
        breakdown = { direct: isDirect, substitute: isSub };

        if (allowed) {
          if (isDirect) {
            source = "direct";
            explanation = "✓ ПРЯМОЙ СОТРУДНИК: Сотрудник числится непосредственно в данном отделе (прямое подразделение строго одно).";
          } else if (isSub) {
            source = "substitute";
            explanation = "✓ ДОСТУП ПО ЗАМЕЩЕНИЮ: Сотрудник имеет доступ к подразделению, так как замещает сотрудника данного отдела.";
          } else {
            source = "hierarchy";
            explanation = "✓ ДОСТУП ПО ИЕРАРХИИ: Сотрудник относится к подразделению через подчиненные подотделы вниз по дереву.";
          }
        } else {
          explanation = "✗ ДОСТУП ЗАПРЕЩЕН: Сотрудник не относится к подразделению ни напрямую, ни через подотделы, ни по замещению.";
        }
      } else if (relation === "direct_employee") {
        if (allowed) {
          source = "direct";
          explanation = "✓ ТОЧНОЕ СОВПАДЕНИЕ: Сотрудник числится непосредственно в этом отделе (прямое подразделение строго одно).";
        } else {
          explanation = "✗ НЕ ПРЯМОЙ СОТРУДНИК: Сотрудник не числится непосредственно в этом отделе (у сотрудника прямое подразделение строго одно).";
        }
      }
    }

    // 3. Проверка штатного расписания (Staffs)
    else if (object.startsWith("Staffs:")) {
      if (relation === "employee" || relation === "can_use") {
        const [isDirect, isSub] = await Promise.all([
          check(user, "direct_employee", object, ctx),
          check(user, "substitute_from_employee", object, ctx)
        ]);
        breakdown = { direct: isDirect, substitute: isSub };

        if (allowed) {
          if (isDirect) {
            source = "direct";
            explanation = "✓ ШТАТНАЯ ДОЛЖНОСТЬ: Сотрудник занимает данную штатную позицию напрямую.";
          } else if (isSub) {
            source = "substitute";
            explanation = "✓ ИСПОЛНЕНИЕ ПО ЗАМЕЩЕНИЮ: Сотрудник исполняет данную штатную позицию по замещению основного сотрудника.";
          } else {
            source = "context";
            explanation = "✓ ДОСТУП К ШТАТКЕ: Доступ предоставлен через контекстные кортежи / модель.";
          }
        } else {
          explanation = "✗ ДОСТУП ЗАПРЕЩЕН: Сотрудник не занимает и не замещает данную штатную позицию.";
        }
      }
    }
  } catch (e) {
    // Резервный fallback
  }

  return { source, breakdown, substitution, explanation };
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `http://${host}`);

  // 1. Проверка доступа (Check: чистый лаконичный ответ OpenFGA)
  if (req.method === "POST" && url.pathname === "/check") {
    try {
      const { user, relation, object, contextualTuples, contextual_tuples } = await readBody(req);
      const ctx = contextualTuples || contextual_tuples;
      const t0 = performance.now();
      const allowed = await check(user, relation, object, ctx);
      const durationMs = Math.round((performance.now() - t0) * 10) / 10;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        allowed,
        durationMs,
        relation
      }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 2. Пакетная проверка (Batch Check)
  if (req.method === "POST" && url.pathname === "/batch-check") {
    try {
      const { checks } = await readBody(req);
      if (!Array.isArray(checks)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Поле checks должно быть массивом" }));
        return;
      }
      const t0 = performance.now();
      const result = await batchCheck(checks);
      const durationMs = Math.round((performance.now() - t0) * 10) / 10;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ result, count: checks.length, durationMs }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }


  // 2. Получение объектов (ListObjects)
  if (req.method === "POST" && (url.pathname === "/list-objects" || url.pathname === "/list")) {
    try {
      const { user, relation, type } = await readBody(req);
      const t0 = performance.now();
      const items = await listObjects(user, relation, type);
      const durationMs = Math.round((performance.now() - t0) * 10) / 10;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items, count: items.length, durationMs }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 3. Получение пользователей (ListUsers)
  if (req.method === "POST" && url.pathname === "/list-users") {
    try {
      const { object, relation, userType } = await readBody(req);
      const t0 = performance.now();
      const items = await listUsers(object, relation, userType);
      const durationMs = Math.round((performance.now() - t0) * 10) / 10;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items, count: items.length, durationMs }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 4. Данные таблиц в JSON
  if (url.pathname === "/data") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(tables));
    return;
  }

  // 4.1 Официальное представление модели OpenFGA в JSON
  // 4.1 Официальное представление модели OpenFGA в JSON и DSL (model.fga)
  if (url.pathname === "/model" || url.pathname === "/model.json") {
    try {
      if (existsSync(MODEL_JSON_PATH)) {
        const raw = readFileSync(MODEL_JSON_PATH, "utf-8");
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(raw);
        return;
      }
    } catch (e) {}
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "model.json не найден" }));
    return;
  }

  if (url.pathname === "/model.fga") {
    try {
      if (existsSync(MODEL_FGA_PATH)) {
        const raw = readFileSync(MODEL_FGA_PATH, "utf-8");
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(raw);
        return;
      }
    } catch (e) {}
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("model.fga не найден");
    return;
  }

  // 5. Трассировка графа модели и цепочки разрешения (Path Trace)
  if (req.method === "POST" && url.pathname === "/trace") {
    try {
      const body = await readBody(req);
      const trace = traceResolutionPath(body, tables);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(trace));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 5.1 Раздача статических стилей и клиентского скрипта
  if (url.pathname === "/style.css") {
    try {
      const css = readFileSync(join(__dirname, "../public/style.css"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
      res.end(css);
    } catch (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("style.css не найден");
    }
    return;
  }

  if (url.pathname === "/app.js") {
    try {
      const js = readFileSync(join(__dirname, "../public/app.js"), "utf-8");
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(js);
    } catch (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("app.js не найден");
    }
    return;
  }

  // 6. Главная страница
  if (url.pathname === "/" || url.pathname === "/index.html") {
    try {
      let html = readFileSync(join(__dirname, "../public/index.html"), "utf-8");
      html = html.replace("__TABLES_DATA__", JSON.stringify(tables));
      let modelJson = null;
      try {
        if (existsSync(MODEL_JSON_PATH)) {
          modelJson = JSON.parse(readFileSync(MODEL_JSON_PATH, "utf-8"));
        }
      } catch (e) {}
      html = html.replace("__MODEL_DATA__", JSON.stringify(modelJson));

      let modelFga = "";
      try {
        if (existsSync(MODEL_FGA_PATH)) {
          modelFga = readFileSync(MODEL_FGA_PATH, "utf-8");
        }
      } catch (e) {}
      html = html.replace("__MODEL_FGA__", JSON.stringify(modelFga));

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Ошибка загрузки страницы: " + err.message);
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Страница не найдена");
});

function startServer(port) {
  server.listen(port, () => {
    console.log(`Сервер запущен: http://localhost:${port}`);
  }).on("error", (err) => {
    if (err.code === "EADDRINUSE" && port === 3000 && !process.env.PORT) {
      console.log(`Порт 3000 занят, переключаюсь на порт 8000...`);
      startServer(8000);
    } else {
      console.error("Ошибка запуска сервера:", err.message);
    }
  });
}

if (process.argv[1]?.endsWith("server.js")) {
  startServer(DEFAULT_PORT);
}
