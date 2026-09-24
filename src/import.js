import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { getStoreId, createFreshStore, uploadModel, writeTuples } from "./client.js";

export function parseCsv(filePath) {
  if (!existsSync(filePath)) return [];
  const text = readFileSync(filePath, "utf-8");
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(",").map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim());
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] || "";
    });
    rows.push(obj);
  }
  return rows;
}

export function buildTuplesFromCsv(csvDir = "./csv") {
  const dir = resolve(csvDir);
  const tuples = [];

  // 1. Divisions
  const divisions = parseCsv(`${dir}/divisions.csv`);
  for (const r of divisions) {
    const { id, parent_id } = r;
    if (parent_id) {
      tuples.push({ user: `Divisions:${parent_id}`, relation: "parent", object: `Divisions:${id}` });
      tuples.push({ user: `Divisions:${id}`, relation: "child", object: `Divisions:${parent_id}` });
    }
  }

  // 2. Staffs
  const staffs = parseCsv(`${dir}/staffs.csv`);
  for (const r of staffs) {
    const { id, division_id, profession_code, employee_username } = r;
    if (division_id) {
      tuples.push({ user: `Divisions:${division_id}`, relation: "direct_division", object: `Staffs:${id}` });
      tuples.push({ user: `Staffs:${id}`, relation: "direct_staff", object: `Divisions:${division_id}` });
    }
    if (profession_code) {
      tuples.push({ user: `Professions:${profession_code}`, relation: "profession", object: `Staffs:${id}` });
      tuples.push({ user: `Staffs:${id}`, relation: "staff", object: `Professions:${profession_code}` });
    }
    if (employee_username) {
      tuples.push({ user: `Employees:${employee_username}`, relation: "direct_employee", object: `Staffs:${id}` });
      tuples.push({ user: `Staffs:${id}`, relation: "direct_staff", object: `Employees:${employee_username}` });
    }
  }

  // 3. Employees
  const employees = parseCsv(`${dir}/employees.csv`);
  for (const r of employees) {
    const { username, division_id, profession_code, staff_id } = r;
    if (division_id) {
      tuples.push({ user: `Divisions:${division_id}`, relation: "direct_division", object: `Employees:${username}` });
      tuples.push({ user: `Employees:${username}`, relation: "direct_employee", object: `Divisions:${division_id}` });
    }
    if (profession_code) {
      tuples.push({ user: `Professions:${profession_code}`, relation: "direct_profession", object: `Employees:${username}` });
      tuples.push({ user: `Employees:${username}`, relation: "direct_employee", object: `Professions:${profession_code}` });
    }
    if (staff_id) {
      tuples.push({ user: `Staffs:${staff_id}`, relation: "direct_staff", object: `Employees:${username}` });
      tuples.push({ user: `Employees:${username}`, relation: "direct_employee", object: `Staffs:${staff_id}` });
    }
  }

  // 4. Replacings (прямые связи замещения между сотрудниками)
  const replacings = parseCsv(`${dir}/replacings.csv`);
  for (const r of replacings) {
    const { id, staff_id, replaced_username, replacing_username } = r;
    if (replaced_username && replacing_username) {
      // replacing_username замещает replaced_username
      tuples.push({ user: `Employees:${replaced_username}`, relation: "direct_replaces", object: `Employees:${replacing_username}` });
      tuples.push({ user: `Employees:${replacing_username}`, relation: "direct_substitute", object: `Employees:${replaced_username}` });
    }
  }

  // 5. Roles
  const roles = parseCsv(`${dir}/roles.csv`);
  for (const r of roles) {
    const user = r.username || r.employee_username;
    const { id } = r;
    if (user && id) {
      tuples.push({ user: `Employees:${user}`, relation: "direct_assignee", object: `Roles:${id}` });
      tuples.push({ user: `Roles:${id}`, relation: "direct_role", object: `Employees:${user}` });
    }
  }

  // 6. Grants (прямые целевые кортежи назначений и исключений)
  const grants = parseCsv(`${dir}/grants.csv`);
  for (const r of grants) {
    const { id, grantee_type, grantee_id, target_type, target_id } = r;
    if (grantee_type === "Employees" && target_type === "Roles") {
      tuples.push({ user: `Employees:${grantee_id}`, relation: "direct_assignee", object: `Roles:${target_id}` });
      tuples.push({ user: `Roles:${target_id}`, relation: "direct_role", object: `Employees:${grantee_id}` });
    } else if (grantee_type === "Employees" && target_type === "Divisions") {
      tuples.push({ user: `Employees:${grantee_id}`, relation: "direct_employee", object: `Divisions:${target_id}` });
      tuples.push({ user: `Divisions:${target_id}`, relation: "direct_division", object: `Employees:${grantee_id}` });
    } else if (grantee_type === "Employees" && target_type === "Staffs") {
      tuples.push({ user: `Employees:${grantee_id}`, relation: "direct_employee", object: `Staffs:${target_id}` });
      tuples.push({ user: `Staffs:${target_id}`, relation: "direct_staff", object: `Employees:${grantee_id}` });
    } else if (grantee_type === "Employees" && target_type === "Professions") {
      tuples.push({ user: `Employees:${grantee_id}`, relation: "direct_employee", object: `Professions:${target_id}` });
      tuples.push({ user: `Professions:${target_id}`, relation: "direct_profession", object: `Employees:${grantee_id}` });
    } else if (grantee_type === "Staffs" && target_type === "Roles") {
      tuples.push({ user: `Staffs:${grantee_id}`, relation: "staff_assignee", object: `Roles:${target_id}` });
    } else if (grantee_type === "Divisions" && target_type === "Roles") {
      tuples.push({ user: `Divisions:${grantee_id}`, relation: "division_assignee", object: `Roles:${target_id}` });
    }
  }

  // Дедупликация
  const seen = new Set();
  const uniqueTuples = [];
  for (const t of tuples) {
    const key = `${t.user}|${t.relation}|${t.object}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueTuples.push(t);
    }
  }

  return uniqueTuples;
}

export async function importAll() {
  console.log("==================================================");
  console.log("📥 Импорт модели и данных CSV в OpenFGA");
  console.log("==================================================");

  const storeId = await createFreshStore("kalifga");
  console.log(`📦 Хранилище (Store): ${storeId}`);

  console.log("📄 Загрузка схемы model.fga...");
  const modelId = await uploadModel("./model.fga");
  if (modelId) {
    console.log(`✓ Модель успешно записана: ${modelId}`);
  }

  // Генерация официального model.json
  try {
    const jsonOut = execSync("fga model transform --file model.fga", { encoding: "utf-8" });
    writeFileSync("./model.json", JSON.stringify(JSON.parse(jsonOut), null, 2), "utf-8");
    console.log("✓ Сформировано официальное JSON-представление: model.json");
  } catch (err) {
    console.warn("Предупреждение при формировании model.json:", err.message);
  }

  console.log("📊 Чтение таблиц из папки csv/...");
  const tuples = buildTuplesFromCsv("./csv");
  console.log(`Сформировано кортежей связей: ${tuples.length}`);

  console.log("🚀 Запись кортежей в OpenFGA...");
  const written = await writeTuples(tuples);
  console.log(`✓ Успешно синхронизировано ${written} кортежей!`);
  console.log("==================================================");
  return { storeId, modelId, tuplesCount: tuples.length };
}

// Запуск напрямую: node src/import.js
if (process.argv[1]?.endsWith("import.js")) {
  importAll().catch(err => {
    console.error("Ошибка импорта:", err.message);
    process.exit(1);
  });
}
