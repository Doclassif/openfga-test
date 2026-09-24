import test from "node:test";
import assert from "node:assert/strict";
import { check, batchCheck, listObjects, listUsers, readTuples, write } from "../src/client.js";
import { parseCsv } from "../src/import.js";
import { resolveAccessDetails, traceResolutionPath } from "../src/server.js";

test("1. Divisions: иерархия подразделений (дерево вверх/вниз)", async (t) => {
  await t.test("ALLOW: Головное 755 является предком для дочернего 215", async () => {
    const allowed = await check("Divisions:755", "ancestor", "Divisions:215");
    assert.equal(allowed, true);
  });

  await t.test("DENY: Дочернее 215 НЕ является предком для головного 755", async () => {
    const allowed = await check("Divisions:215", "ancestor", "Divisions:755");
    assert.equal(allowed, false);
  });

  await t.test("ARRAY: Сотрудник 34491 входит в массив отделов вверх по дереву", async () => {
    const divs = await listUsers("Employees:34491", "division", "Divisions");
    assert.deepEqual(divs, ["215", "755"]);
  });
});

test("2. Professions: штатные единицы и профессии", async (t) => {
  await t.test("ALLOW: Штатка 17363 привязана к профессии 5011", async () => {
    const allowed = await check("Staffs:17363", "staff", "Professions:5011");
    assert.equal(allowed, true);
  });

  await t.test("DENY: Штатка 12099 НЕ имеет профессию 5011", async () => {
    const allowed = await check("Staffs:12099", "staff", "Professions:5011");
    assert.equal(allowed, false);
  });

  await t.test("ARRAY: Профессии сотрудника 34491 (напрямую и через замещение)", async () => {
    // По цепочке унаследованы профессии 5011 (от 42179) и 5062 (от 53450)
    const profs = await listObjects("Employees:34491", "employee", "Professions");
    assert.deepEqual(profs, ["3678", "5011", "5062"]);

    // При проверке только 1-го уровня (employee_direct) — только своя (3678) и 42179 (5011)
    const directProfs = await listObjects("Employees:34491", "employee_direct", "Professions");
    assert.deepEqual(directProfs, ["3678", "5011"]);
  });
});

test("3. Staffs: штатное расписание и сотрудники", async (t) => {
  await t.test("ALLOW: Сотрудник 42179 занимает штатную позицию 17363", async () => {
    const allowed = await check("Employees:42179", "employee", "Staffs:17363");
    assert.equal(allowed, true);
  });

  await t.test("DENY: Посторонний сотрудник 68997 НЕ занимает позицию 17363", async () => {
    const allowed = await check("Employees:68997", "employee", "Staffs:17363");
    assert.equal(allowed, false);
  });

  await t.test("ARRAY: Штатные единицы сотрудника 34491", async () => {
    // По цепочке доступны штатки: 12099 (своя), 17363 (42179) и 12626 (53450)
    const staffs = await listObjects("Employees:34491", "employee", "Staffs");
    assert.deepEqual(staffs, ["12099", "12626", "17363"]);

    // Напрямую и 1-й уровень — только своя и 42179
    const directStaffs = await listObjects("Employees:34491", "employee_direct", "Staffs");
    assert.deepEqual(directStaffs, ["12099", "17363"]);
  });
});

test("4. Employees: привязка сотрудников к отделу", async (t) => {
  await t.test("ALLOW: Отдел 755 связан с сотрудником 42179", async () => {
    const allowed = await check("Divisions:755", "division", "Employees:42179");
    assert.equal(allowed, true);
  });

  await t.test("DENY: Чужой отдел 126 НЕ связан с сотрудником 42179", async () => {
    const allowed = await check("Divisions:126", "division", "Employees:42179");
    assert.equal(allowed, false);
  });

  await t.test("EXACT: Точное совпадение подразделения сотрудника 34491 (только 215)", async () => {
    const direct = await listUsers("Employees:34491", "direct_division", "Divisions");
    assert.deepEqual(direct, ["215"]);
    const isDirect215 = await check("Divisions:215", "direct_division", "Employees:34491");
    assert.equal(isDirect215, true);
    const isDirect755 = await check("Divisions:755", "direct_division", "Employees:34491");
    assert.equal(isDirect755, false); // 755 - предок, а не прямое
  });

  await t.test("DESCENDANT: Подразделения вниз по дереву (подчиненные отделы)", async () => {
    // 42179 в головном отделе 755 -> дочерний отдел 215 подчинен ему
    const isDescendant = await check("Divisions:215", "descendant_division", "Employees:42179");
    assert.equal(isDescendant, true);
    // 34491 в отделе 215 -> отдел 147 подчинен ему вниз по дереву
    const isDescendant147 = await check("Divisions:147", "descendant_division", "Employees:34491");
    assert.equal(isDescendant147, true);
    // 34491 НЕ имеет подчиненного головного отдела 755 (он выше)
    const isNotDescendant755 = await check("Divisions:755", "descendant_division", "Employees:34491");
    assert.equal(isNotDescendant755, false);
  });
});

test("5. Replacings: замещения сотрудников", async (t) => {
  await t.test("ALLOW: Сотрудник 34491 замещает сотрудника 42179", async () => {
    const allowed = await check("Employees:34491", "substitute", "Employees:42179");
    assert.equal(allowed, true);
  });

  await t.test("DENY: Посторонний сотрудник 68997 НЕ замещает сотрудника 42179", async () => {
    const allowed = await check("Employees:68997", "substitute", "Employees:42179");
    assert.equal(allowed, false);
  });

  await t.test("ARRAY: Список замещающих для сотрудника 42179", async () => {
    const subs = await listUsers("Employees:42179", "substitute", "Employees");
    assert.deepEqual(subs, ["34491"]);
  });
});

test("6. Roles: наследование ролей через замещения", async (t) => {
  const roleId = "c66452e0-23c5-5cbf-97fa-07b1480465dc";

  await t.test("ALLOW: Замещающий 34491 унаследовал роль заменяемого", async () => {
    const allowed = await check("Employees:34491", "assignee", `Roles:${roleId}`);
    assert.equal(allowed, true);
  });

  await t.test("DENY: Посторонний сотрудник 68997 НЕ имеет этой роли", async () => {
    const allowed = await check("Employees:68997", "assignee", `Roles:${roleId}`);
    assert.equal(allowed, false);
  });

  await t.test("ARRAY: Массив всех ролей сотрудника 34491", async () => {
    // По цепочке: своя роль (d04cd18e) + роль c66452e0 замещаемого 42179 + роль bd38f78f замещаемого 53450
    const roles = await listObjects("Employees:34491", "assignee", "Roles");
    assert.deepEqual(roles, [
      "bd38f78f-7ad0-595e-81d6-06b970a7e9c3",
      "c66452e0-23c5-5cbf-97fa-07b1480465dc",
      "d04cd18e-8ec4-5648-be93-e20946733d20"
    ]);

    // При ограничении 1-м уровнем (assignee_direct) — без роли 53450
    const directRoles = await listObjects("Employees:34491", "assignee_direct", "Roles");
    assert.deepEqual(directRoles, [
      "c66452e0-23c5-5cbf-97fa-07b1480465dc",
      "d04cd18e-8ec4-5648-be93-e20946733d20"
    ]);
  });
});

test("7. Roles & Substitutions: прямые назначения ролей и их наследование по замещению", async (t) => {
  const roleId = "c66452e0-23c5-5cbf-97fa-07b1480465dc"; // Роль сотрудника 42179

  await t.test("ALLOW: Сотрудник 42179 имеет роль напрямую", async () => {
    const allowed = await check("Employees:42179", "assignee", `Roles:${roleId}`);
    assert.equal(allowed, true);
  });

  await t.test("DENY: Другой сотрудник 68997 НЕ имеет этой роли", async () => {
    const allowed = await check("Employees:68997", "assignee", `Roles:${roleId}`);
    assert.equal(allowed, false);
  });

  await t.test("CHAIN ALLOW: Замещающий 34491 унаследовал роль заменяемого сотрудника 42179", async () => {
    const allowed = await check("Employees:34491", "assignee", `Roles:${roleId}`);
    assert.equal(allowed, true);
  });
});

test("8. Batch Check & Contextual Tuples: пачка сущностей и временный контекст", async (t) => {
  await t.test("BATCH: проверка нескольких прав за 1 запрос", async () => {
    const result = await batchCheck([
      {
        correlation_id: "check-1",
        tuple_key: { user: "Employees:34491", relation: "substitute", object: "Employees:42179" }
      },
      {
        correlation_id: "check-2",
        tuple_key: { user: "Employees:68997", relation: "substitute", object: "Employees:42179" }
      }
    ]);
    assert.equal(result["check-1"]?.allowed, true);
    assert.equal(result["check-2"]?.allowed, false);
  });

  await t.test("CONTEXTUAL: временная связь на лету без записи в базу данных", async () => {
    // 68997 НЕ замещает 42179 в базе
    const before = await check("Employees:68997", "substitute", "Employees:42179");
    assert.equal(before, false);

    // Но если передать временную связь прямо в запрос (на лету)
    const withContext = await check("Employees:68997", "substitute", "Employees:42179", [
      { user: "Employees:68997", relation: "direct_substitute", object: "Employees:42179" }
    ]);
    assert.equal(withContext, true);

    // В базе связь по-прежнему отсутствует
    const after = await check("Employees:68997", "substitute", "Employees:42179");
    assert.equal(after, false);
  });
});

test("9. Strict Invariant: прямое подразделение и прямая профессия строго единичны (1:1)", async (t) => {
  await t.test("EXACT 1:1: Сотрудник 34491 имеет ровно 1 прямой отдел и ровно 1 прямую профессию", async () => {
    const divs = await listUsers("Employees:34491", "direct_division", "Divisions");
    assert.deepEqual(divs, ["215"]);
    assert.equal(divs.length, 1);

    const profs = await listUsers("Employees:34491", "direct_profession", "Professions");
    assert.deepEqual(profs, ["3678"]);
    assert.equal(profs.length, 1);
  });

  await t.test("INVARIANT: Все сотрудники имеют строго 1 прямое подразделение и 1 прямую профессию", async () => {
    const employees = parseCsv("./csv/employees.csv");
    for (const e of employees.slice(0, 15)) {
      const divs = await listUsers(`Employees:${e.username}`, "direct_division", "Divisions");
      assert.equal(divs.length, 1, `Employee ${e.username} must have exactly 1 direct_division`);
      assert.equal(divs[0], e.division_id);

      const profs = await listUsers(`Employees:${e.username}`, "direct_profession", "Professions");
      assert.equal(profs.length, 1, `Employee ${e.username} must have exactly 1 direct_profession`);
      assert.equal(profs[0], e.profession_code);
    }
  });
});

test("10. Divisions: нижние подразделения (child, descendant) и сотрудники напрямую (direct_employee)", async (t) => {
  await t.test("DIRECT: Сотрудники головного отдела 755 напрямую — только 42179", async () => {
    const directEmps = await listUsers("Divisions:755", "direct_employee", "Employees");
    assert.deepEqual(directEmps, ["42179"]);

    const isDirect42179 = await check("Employees:42179", "direct_employee", "Divisions:755");
    assert.equal(isDirect42179, true);

    const isDirect34491 = await check("Employees:34491", "direct_employee", "Divisions:755");
    assert.equal(isDirect34491, false);
  });

  await t.test("CHILD: Прямые дочерние подразделения отдела 755 (1-й уровень)", async () => {
    const children = await listUsers("Divisions:755", "child", "Divisions");
    assert.equal(children.length, 9);
    assert.ok(children.includes("215"));
    assert.ok(children.includes("126"));
  });

  await t.test("DESCENDANT: Все подчиненные подразделения вниз по дереву для 755", async () => {
    const descendants = await listUsers("Divisions:755", "descendant", "Divisions");
    assert.equal(descendants.length, 99);
    assert.ok(descendants.includes("147")); // внук через 215
  });
});

test("11. Substitution Access: проверка прав с учетом замещения сотрудника", async (t) => {
  const roleId = "c66452e0-23c5-5cbf-97fa-07b1480465dc";

  await t.test("ALLOW: Замещающий 34491 имеет доступ к роли 42179 по замещению (assignee)", async () => {
    const allowed = await check("Employees:34491", "assignee", `Roles:${roleId}`);
    assert.equal(allowed, true);
  });

  await t.test("DENY: Замещающий 34491 НЕ имеет прямого назначения на эту роль (direct_assignee)", async () => {
    const allowed = await check("Employees:34491", "direct_assignee", `Roles:${roleId}`);
    assert.equal(allowed, false);
  });

  await t.test("ALLOW: Точечная проверка substitute_assignee для роли", async () => {
    const allowed = await check("Employees:34491", "substitute_assignee", `Roles:${roleId}`);
    assert.equal(allowed, true);
  });

  await t.test("ALLOW: Замещающий 66211 имеет доступ к подразделению 787 замещаемого 68176", async () => {
    const allowed = await check("Employees:66211", "employee", "Divisions:787");
    assert.equal(allowed, true);

    const isSub = await check("Employees:66211", "substitute_employee", "Divisions:787");
    assert.equal(isSub, true);

    const isDirect = await check("Employees:66211", "direct_employee", "Divisions:787");
    assert.equal(isDirect, false);
  });

  await t.test("EXPLAIN: Резолюция источника прав указывает на замещение и ФИО заменяемого", async () => {
    const allowed = await check("Employees:34491", "assignee", `Roles:${roleId}`);
    const details = await resolveAccessDetails("Employees:34491", "assignee", `Roles:${roleId}`, allowed);
    assert.equal(details.source, "substitute");
    assert.equal(details.breakdown.direct, false);
    assert.equal(details.breakdown.substitute, true);
    assert.ok(details.substitution.is_substitute);
    assert.equal(details.substitution.replaced_users[0].username, "42179");
    assert.ok(details.explanation.includes("Сотрудник 42179"));
  });
});

test("12. Divisions: столбцы code и full_code (иерархическая склейка без точек и запятых)", async (t) => {
  const divisions = parseCsv("./csv/divisions.csv");

  await t.test("COLUMNS: Наличие колонок code и full_code (pcode удален)", async () => {
    assert.ok(divisions.length > 0);
    const d0 = divisions[0];
    assert.ok("code" in d0, "divisions must have code");
    assert.ok("full_code" in d0, "divisions must have full_code");
    assert.equal(d0.pcode, undefined, "pcode should be removed");
  });

  await t.test("ROOT: Для головного отдела 755 full_code равен его коду 755", async () => {
    const root = divisions.find(d => d.id === "755");
    assert.ok(root);
    assert.equal(root.code, "755");
    assert.equal(root.full_code, "755");
  });

  await t.test("CHILD: Для дочернего отдела 215 full_code склеен как 755215", async () => {
    const div215 = divisions.find(d => d.id === "215");
    assert.ok(div215);
    assert.equal(div215.code, "215");
    assert.equal(div215.full_code, "755215");
  });

  await t.test("GRANDCHILD: Для отдела 147 full_code склеен как 755215147", async () => {
    const div147 = divisions.find(d => d.id === "147");
    assert.ok(div147);
    assert.equal(div147.code, "147");
    assert.equal(div147.full_code, "755215147");
  });
});

test("13. Action Permission: целевое право can_use", async (t) => {
  const roleId = "c66452e0-23c5-5cbf-97fa-07b1480465dc";

  await t.test("ROLES: can_use разрешено для замещающего 34491 и запрещено для постороннего", async () => {
    const allow34491 = await check("Employees:34491", "can_use", `Roles:${roleId}`);
    assert.equal(allow34491, true);

    const deny68997 = await check("Employees:68997", "can_use", `Roles:${roleId}`);
    assert.equal(deny68997, false);
  });

  await t.test("DIVISIONS: can_use разрешено для сотрудника отдела 755", async () => {
    const allow42179 = await check("Employees:42179", "can_use", "Divisions:755");
    assert.equal(allow42179, true);

    const detailsDiv = await resolveAccessDetails("Employees:42179", "can_use", "Divisions:755", allow42179);
    assert.equal(detailsDiv.source, "direct");
    assert.ok(detailsDiv.explanation.includes("ПРЯМОЙ СОТРУДНИК"));

    const allowSub = await check("Employees:66211", "can_use", "Divisions:787");
    assert.equal(allowSub, true);

    const detailsSubDiv = await resolveAccessDetails("Employees:66211", "can_use", "Divisions:787", allowSub);
    assert.equal(detailsSubDiv.source, "substitute");
    assert.ok(detailsSubDiv.explanation.includes("ДОСТУП ПО ЗАМЕЩЕНИЮ"));
  });

  await t.test("STAFFS & PROFESSIONS: can_use работает для штатки и профессии", async () => {
    const allowStaff = await check("Employees:34491", "can_use", "Staffs:17363");
    assert.equal(allowStaff, true);

    const allowProf = await check("Employees:34491", "can_use", "Professions:5011");
    assert.equal(allowProf, true);
  });
});

test("14. Substitution Lookup: замещающий видит подразделения и штатки замещаемого сотрудника", async (t) => {
  await t.test("STAFF: замещающий 34491 видит личную штатку (12099) и штатку замещаемого сотрудника (17363)", async () => {
    // Вся цепочка замещений
    const staffs = await listUsers("Employees:34491", "staff", "Staffs");
    assert.deepEqual(staffs.sort(), ["12099", "12626", "17363"].sort());

    // Только 1-й уровень
    const staffDirect = await listUsers("Employees:34491", "staff_direct", "Staffs");
    assert.deepEqual(staffDirect.sort(), ["12099", "17363"].sort());

    const staffFromReplaced = await listUsers("Employees:34491", "staff_from_replaced", "Staffs");
    assert.deepEqual(staffFromReplaced, ["17363"]);
  });

  await t.test("DIVISIONS: замещающий 34491 видит головной отдел (755) и подчиненные подотделы замещаемого сотрудника", async () => {
    const divFromReplaced = await listUsers("Employees:34491", "division_from_replaced", "Divisions");
    assert.deepEqual(divFromReplaced, ["755"]);

    const descDivs = await listUsers("Employees:34491", "descendant_division_from_replaced", "Divisions");
    assert.equal(descDivs.length, 99);
  });

  await t.test("CHECK: check для замещающего возвращает просто true (allow)", async () => {
    const allowRole = await check("Employees:34491", "can_use", "Roles:c66452e0-23c5-5cbf-97fa-07b1480465dc");
    assert.equal(allowRole, true);

    const allowStaff = await check("Employees:34491", "can_use", "Staffs:17363");
    assert.equal(allowStaff, true);
  });
});

test("15. Graph Tracer: трассировка путей разрешения в графе модели и данных", async (t) => {
  const tables = {
    divisions: parseCsv("./csv/divisions.csv"),
    professions: parseCsv("./csv/professions.csv"),
    staffs: parseCsv("./csv/staffs.csv"),
    employees: parseCsv("./csv/employees.csv"),
    replacings: parseCsv("./csv/replacings.csv"),
    roles: parseCsv("./csv/roles.csv")
  };

  await t.test("CHECK TRACE: замещающий 34491 строит путь через 42179 к роли c66452e0", () => {
    const trace = traceResolutionPath({
      type: "check",
      user: "Employees:34491",
      relation: "can_use",
      object: "Roles:c66452e0-23c5-5cbf-97fa-07b1480465dc",
      allowed: true
    }, tables);

    assert.equal(trace.allowed, true);
    assert.equal(trace.nodes.length, 3);
    assert.equal(trace.nodes[0].id, "Employees:34491");
    assert.equal(trace.nodes[1].id, "Employees:42179");
    assert.equal(trace.nodes[2].id, "Roles:c66452e0-23c5-5cbf-97fa-07b1480465dc");
    assert.equal(trace.edges[0].relation, "replaces");
    assert.equal(trace.edges[1].relation, "direct_assignee");
    assert.equal(trace.modelSteps[0].relation, "replaces");
    assert.equal(trace.modelSteps[1].relation, "assignee");
  });

  await t.test("LOOKUP STAFF TRACE: выборка штаток 34491 строит разветвление к личной и замещаемого сотрудника", () => {
    const trace = traceResolutionPath({
      type: "lookup",
      user: "Employees:34491",
      relation: "staff",
      userType: "Staffs",
      items: ["12099", "17363"]
    }, tables);

    const staffNodeIds = trace.nodes.map(n => n.id);
    assert.ok(staffNodeIds.includes("Staffs:12099"));
    assert.ok(staffNodeIds.includes("Staffs:17363"));
    assert.ok(staffNodeIds.includes("Employees:42179"));
  });

  await t.test("LOOKUP DIVISIONS TRACE: иерархия подчиненных отделов строится от корня", () => {
    const trace = traceResolutionPath({
      type: "lookup",
      object: "Divisions:755",
      relation: "descendant",
      userType: "Divisions",
      items: ["215", "147", "107"]
    }, tables);

    assert.equal(trace.nodes[0].id, "Divisions:755");
    assert.ok(trace.nodes.length >= 2);
    assert.equal(trace.modelSteps[0].relation, "descendant");
  });

  await t.test("LOOKUP DIRECT DIVISION TRACE: строго личное подразделение без замещаемого", () => {
    const trace = traceResolutionPath({
      type: "lookup",
      user: "Employees:34491",
      relation: "direct_division",
      userType: "Divisions",
      items: ["215"]
    }, tables);

    const nodeIds = trace.nodes.map(n => n.id);
    assert.ok(nodeIds.includes("Employees:34491"));
    assert.ok(nodeIds.includes("Divisions:215"));
    assert.ok(!nodeIds.includes("Employees:42179"));
    assert.ok(!nodeIds.includes("Divisions:755"));
    assert.equal(trace.edges.length, 1);
    assert.equal(trace.edges[0].relation, "direct_division");
  });

  await t.test("LOOKUP DIVISION FROM REPLACED TRACE: отдел замещаемого сотрудника через replaces", () => {
    const trace = traceResolutionPath({
      type: "lookup",
      user: "Employees:34491",
      relation: "division_from_replaced",
      userType: "Divisions",
      items: ["755"]
    }, tables);

    const nodeIds = trace.nodes.map(n => n.id);
    assert.ok(nodeIds.includes("Employees:34491"));
    assert.ok(nodeIds.includes("Employees:42179"));
    assert.ok(nodeIds.includes("Divisions:755"));
    assert.ok(!nodeIds.includes("Divisions:215"));
    assert.equal(trace.edges.length, 2);
    assert.equal(trace.edges[0].relation, "replaces");
    assert.equal(trace.edges[1].relation, "direct_division");
  });

  await t.test("LOOKUP ALL DIVISIONS TRACE: строится разветвление к личному и замещаемому отделам", () => {
    const trace = traceResolutionPath({
      type: "lookup",
      user: "Employees:34491",
      relation: "all_divisions_chain",
      userType: "Divisions",
      items: ["215", "755"]
    }, tables);

    const nodeIds = trace.nodes.map(n => n.id);
    assert.ok(nodeIds.includes("Employees:34491"));
    assert.ok(nodeIds.includes("Divisions:215"));
    assert.ok(nodeIds.includes("Employees:42179"));
    assert.ok(nodeIds.includes("Divisions:755"));
  });

  await t.test("CONTEXTUAL GRAPH TRACE: Трассировка графа с учетом динамических contextual tuples", () => {
    const trace = traceResolutionPath({
      type: "check",
      user: "Employees:68997",
      relation: "can_use",
      object: "Roles:c66452e0-23c5-5cbf-97fa-07b1480465dc",
      contextualTuples: [
        { user: "Employees:68997", relation: "direct_substitute", object: "Employees:42179" }
      ],
      allowed: true
    }, tables);

    assert.equal(trace.allowed, true);
    assert.equal(trace.nodes.length, 3);
    assert.equal(trace.nodes[0].id, "Employees:68997");
    assert.equal(trace.nodes[1].id, "Employees:42179");
    assert.equal(trace.nodes[2].id, "Roles:c66452e0-23c5-5cbf-97fa-07b1480465dc");
    assert.equal(trace.edges[0].relation, "replaces");
    assert.equal(trace.edges[1].relation, "direct_assignee");
  });
});

test("16. Chain Substitution & Depth Choice: выбор 1-го уровня vs транзитивной цепочки", async (t) => {
  const roleBoss = "c66452e0-23c5-5cbf-97fa-07b1480465dc"; // 42179 (1-й уровень для 34491)
  const roleDirector = "bd38f78f-7ad0-595e-81d6-06b970a7e9c3"; // 53450 (2-й уровень для 34491)

  await t.test("1-Й УРОВЕНЬ: 34491 имеет доступ к роли 42179 (can_use_direct)", async () => {
    const allowed = await check("Employees:34491", "can_use_direct", `Roles:${roleBoss}`);
    assert.equal(allowed, true);
  });

  await t.test("1-Й УРОВЕНЬ БЛОКИРОВКА: 34491 НЕ имеет доступа к роли 53450 (can_use_direct)", async () => {
    const allowed = await check("Employees:34491", "can_use_direct", `Roles:${roleDirector}`);
    assert.equal(allowed, false);
  });

  await t.test("ВСЯ ЦЕПОЧКА ALLOW: 34491 получает доступ к роли 53450 по цепочке (can_use_chain)", async () => {
    const allowed = await check("Employees:34491", "can_use_chain", `Roles:${roleDirector}`);
    assert.equal(allowed, true);
  });

  await t.test("DIVISIONS 1-Й УРОВЕНЬ vs ЦЕПОЧКА: отдел 755 (1-й уровень) vs отдел 647 (2-й уровень)", async () => {
    // 755 (отдел 42179) доступен и по 1-му уровню, и по цепочке
    assert.equal(await check("Employees:34491", "can_use_direct", "Divisions:755"), true);
    assert.equal(await check("Employees:34491", "can_use_chain", "Divisions:755"), true);

    // 647 (отдел 53450) запрещен на 1-м уровне и разрешен по цепочке
    assert.equal(await check("Employees:34491", "can_use_direct", "Divisions:647"), false);
    assert.equal(await check("Employees:34491", "can_use_chain", "Divisions:647"), true);
  });

  await t.test("INVARIANT: большинство сотрудников НЕ замещают никого", async () => {
    const replacings = parseCsv("./csv/replacings.csv");
    const employees = parseCsv("./csv/employees.csv");
    assert.ok(replacings.length <= 10, "Замещений должно быть не более 10");
    assert.ok(employees.length >= 100, "Сотрудников 100");
    const replacingUsers = new Set(replacings.map(r => r.replacing_username));
    assert.ok(replacingUsers.size <= 10);
    // Сотрудник 68997 не замещает
    assert.equal(replacingUsers.has("68997"), false);
  });
});

test("17. Native ReBAC & Contextual API: все цепочки вычисляются OpenFGA напрямую без промежуточной обработки", async (t) => {
  await t.test("DIVISIONS: Сотрудник 42179 имеет доступ к своему подразделению 755 напрямую", async () => {
    const hasDiv = await check("Employees:42179", "can_use", "Divisions:755");
    assert.equal(hasDiv, true);
  });

  await t.test("STAFFS: Замещающий 34491 имеет доступ к штатке 17363 замещаемого сотрудника 42179", async () => {
    const hasStaff = await check("Employees:34491", "can_use", "Staffs:17363");
    assert.equal(hasStaff, true);
  });

  await t.test("PROFESSIONS: Замещающий 34491 имеет доступ к профессии 5011 замещаемого сотрудника 42179", async () => {
    const hasProf = await check("Employees:34491", "can_use", "Professions:5011");
    assert.equal(hasProf, true);
  });

  await t.test("CHAIN ROLES: Замещающий 34491 наследует роль bd38f78f по цепочке 2-го уровня", async () => {
    const roleId = "bd38f78f-7ad0-595e-81d6-06b970a7e9c3";
    const allowed = await check("Employees:34491", "can_use", `Roles:${roleId}`);
    assert.equal(allowed, true);
  });

  await t.test("CHAIN DIVISIONS: Замещающий 34491 имеет доступ к отделу 647 по цепочке 2-го уровня", async () => {
    const allowed = await check("Employees:34491", "can_use", "Divisions:647");
    assert.equal(allowed, true);
  });

  await t.test("DYNAMIC API CONTEXTUAL TUPLE: Временное замещение на лету без изменения БД", async () => {
    const targetRole = "Roles:c66452e0-23c5-5cbf-97fa-07b1480465dc"; // принадлежит 42179
    // Без контекста - запрещено
    assert.equal(await check("Employees:68997", "can_use", targetRole), false);

    // С контекстным кортежем замещения в API
    const allowedWithContext = await check("Employees:68997", "can_use", targetRole, [
      { user: "Employees:42179", relation: "direct_replaces", object: "Employees:68997" },
      { user: "Employees:68997", relation: "direct_substitute", object: "Employees:42179" }
    ]);
    assert.equal(allowedWithContext, true);

    // База не изменилась - снова запрещено
    assert.equal(await check("Employees:68997", "can_use", targetRole), false);
  });
});

test("18. Replacings Entity: первый класс сущности в OpenFGA, model.json и графе", async (t) => {
  await t.test("ALLOW REPLACING: Замещающий 34491 имеет доступ к записи замещения 73442", async () => {
    const allowed = await check("Employees:34491", "can_use", "Replacings:73442");
    assert.equal(allowed, true);
  });

  await t.test("ALLOW REPLACED: Замещаемый 42179 имеет доступ к записи замещения 73442", async () => {
    const allowed = await check("Employees:42179", "can_use", "Replacings:73442");
    assert.equal(allowed, true);
  });

  await t.test("DENY STRANGER: Посторонний сотрудник 68997 не имеет доступа к чужому замещению", async () => {
    const allowed = await check("Employees:68997", "can_use", "Replacings:73442");
    assert.equal(allowed, false);
  });

  await t.test("TRACE: Построение трассировки графа для сущности Replacings", () => {
    const tables = {
      divisions: parseCsv("./csv/divisions.csv"),
      professions: parseCsv("./csv/professions.csv"),
      staffs: parseCsv("./csv/staffs.csv"),
      employees: parseCsv("./csv/employees.csv"),
      replacings: parseCsv("./csv/replacings.csv"),
      roles: parseCsv("./csv/roles.csv")
    };
    const trace = traceResolutionPath({
      type: "check",
      user: "Employees:34491",
      relation: "can_use",
      object: "Replacings:73442",
      allowed: true
    }, tables);

    assert.equal(trace.allowed, true);
    assert.equal(trace.nodes.length, 2);
    assert.equal(trace.nodes[0].id, "Employees:34491");
    assert.equal(trace.nodes[1].id, "Replacings:73442");
    assert.equal(trace.edges[0].relation, "replacing");
    assert.equal(trace.modelSteps[0].from, "Employees");
    assert.equal(trace.modelSteps[0].to, "Replacings");
  });
});

test("19. Read & Write API: нативные методы OpenFGA для чтения и записи кортежей ReBAC", async (t) => {
  await t.test("READ ALL: Чтение кортежей с пагинацией (первые 10 кортежей)", async () => {
    const res = await readTuples(null, 10);
    assert.ok(Array.isArray(res.tuples));
    assert.equal(res.tuples.length, 10);
    assert.ok(res.continuation_token !== undefined);
  });

  await t.test("READ FILTER: Чтение кортежей по конкретному объекту (Divisions:215)", async () => {
    const res = await readTuples({ object: "Divisions:215" }, 10);
    assert.ok(Array.isArray(res.tuples));
    assert.ok(res.tuples.length > 0);
    for (const t of res.tuples) {
      assert.equal(t.key.object, "Divisions:215");
    }
  });

  await t.test("READ FILTER: Чтение кортежей по пользователю и типу объекта (Employees:34491 в Divisions:)", async () => {
    const res = await readTuples({ user: "Employees:34491", object: "Divisions:" }, 10);
    assert.ok(Array.isArray(res.tuples));
    assert.ok(res.tuples.length >= 1);
    const hasEmployee = res.tuples.some(t => t.key.user === "Employees:34491" && t.key.relation === "direct_employee" && t.key.object === "Divisions:215");
    assert.ok(hasEmployee);
  });

  await t.test("WRITE & DELETE: Запись и удаление произвольного кортежа через Write API", async () => {
    const testTuple = { user: "Employees:99999", relation: "direct_assignee", object: "Roles:bd38f78f-7ad0-595e-81d6-06b970a7e9c3" };
    // 1. Проверяем, что права изначально нет
    const beforeCheck = await check(testTuple.user, testTuple.relation, testTuple.object);
    assert.equal(beforeCheck, false);

    // 2. Записываем кортеж через write
    const writeRes = await write([testTuple]);
    assert.equal(writeRes.success, true);

    // 3. Проверяем, что теперь право есть
    const afterWriteCheck = await check(testTuple.user, testTuple.relation, testTuple.object);
    assert.equal(afterWriteCheck, true);

    // 4. Удаляем кортеж через write
    const deleteRes = await write([], [testTuple]);
    assert.equal(deleteRes.success, true);

    // 5. Проверяем, что право снова отозвано
    const afterDeleteCheck = await check(testTuple.user, testTuple.relation, testTuple.object);
    assert.equal(afterDeleteCheck, false);
  });
});



