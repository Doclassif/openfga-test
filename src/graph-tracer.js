/**
 * Модуль трассировки путей в графе модели OpenFGA и реляционных данных
 */

export function traceResolutionPath(params, tables = {}) {
  const {
    type,        // "check" | "lookup"
    user,         // e.g. "Employees:34491"
    relation,     // e.g. "can_use", "assignee", "staff", "descendant"
    object,       // e.g. "Roles:c66452e0...", "Divisions:755"
    userType,     // for lookup: "Employees", "Divisions", etc.
    items = [],   // for lookup: returned items array
    allowed = true
  } = params;

  const employees = tables.employees || [];
  const divisions = tables.divisions || [];
  const roles = tables.roles || [];
  const staffs = tables.staffs || [];
  const professions = tables.professions || [];

  const ctxTuples = params.contextualTuples || params.contextual_tuples || [];
  const replacings = [...(tables.replacings || [])];
  const grants = [...(tables.grants || [])];

  if (Array.isArray(ctxTuples)) {
    ctxTuples.forEach(ct => {
      if (ct.relation === "direct_substitute" || ct.relation === "substitute") {
        const repIng = String(ct.user).replace("Employees:", "");
        const repEd = String(ct.object).replace("Employees:", "");
        if (repIng && repEd && !replacings.some(r => r.replacing_username === repIng && r.replaced_username === repEd)) {
          replacings.push({
            id: `ctx-${repIng}-${repEd}`,
            replacing_username: repIng,
            replaced_username: repEd,
            isContextual: true
          });
        }
      } else if (ct.relation === "direct_replaces" || ct.relation === "replaces") {
        const repEd = String(ct.user).replace("Employees:", "");
        const repIng = String(ct.object).replace("Employees:", "");
        if (repIng && repEd && !replacings.some(r => r.replacing_username === repIng && r.replaced_username === repEd)) {
          replacings.push({
            id: `ctx-${repIng}-${repEd}`,
            replacing_username: repIng,
            replaced_username: repEd,
            isContextual: true
          });
        }
      } else if (ct.relation === "direct_assignee") {
        const u = String(ct.user).replace("Employees:", "");
        const o = String(ct.object).replace("Roles:", "");
        if (u && o) {
          grants.push({
            id: `ctx-${u}-${o}`,
            grantee_id: u,
            target_id: o,
            target_type: "Roles",
            isContextual: true
          });
        }
      } else if (ct.relation === "direct_employee") {
        const u = String(ct.user).replace("Employees:", "");
        const [oType, oId] = String(ct.object).split(":");
        if (u && oId) {
          grants.push({
            id: `ctx-${u}-${oId}`,
            grantee_id: u,
            target_id: oId,
            target_type: oType || "Divisions",
            isContextual: true
          });
        }
      }
    });
  }

  const getEmpLabel = (u) => {
    const raw = String(u).replace("Employees:", "");
    const e = employees.find(x => x.username === raw);
    return e ? `${raw} — ${e.full_name}` : `Сотрудник ${raw}`;
  };

  const getDivLabel = (d) => {
    const raw = String(d).replace("Divisions:", "");
    const div = divisions.find(x => x.id === raw);
    return div ? `${raw} — ${div.name}${div.full_code ? ` [${div.full_code}]` : ""}` : `Отдел ${raw}`;
  };

  const getRoleLabel = (r) => {
    const raw = String(r).replace("Roles:", "");
    const role = roles.find(x => x.id === raw);
    return role ? `${role.role_name}` : `Роль ${raw.slice(0, 8)}...`;
  };

  const getStaffLabel = (s) => {
    const raw = String(s).replace("Staffs:", "");
    const staff = staffs.find(x => x.id === raw);
    if (!staff) return `Штатка ${raw}`;
    const prof = professions.find(p => p.code === staff.profession_code);
    const div = divisions.find(d => d.id === staff.division_id);
    return `Штатка ${raw} (${prof ? prof.name : staff.profession_code}, ${div ? div.name : staff.division_id})`;
  };

  const getProfLabel = (p) => {
    const raw = String(p).replace("Professions:", "");
    const prof = professions.find(x => x.code === raw);
    return prof ? `${raw} — ${prof.name}` : `Профессия ${raw}`;
  };

  const getReplacingLabel = (r) => {
    const raw = String(r).replace("Replacings:", "");
    const rep = replacings.find(x => x.id === raw);
    return rep ? `Замещение ${raw} (${rep.replacing_username} замещает ${rep.replaced_username})` : `Замещение ${raw}`;
  };

  const getGrantLabel = (g) => {
    const raw = String(g).replace("Grants:", "");
    const gr = grants.find(x => x.id === raw);
    return gr ? `Грант ${raw} (ID: ${raw})` : `Грант ${raw}`;
  };

  const getEntityLabel = (entType, rawId) => {
    const raw = String(rawId).replace(`${entType}:`, "");
    if (entType === "Employees") return getEmpLabel(raw);
    if (entType === "Divisions") return getDivLabel(raw);
    if (entType === "Roles") return getRoleLabel(raw);
    if (entType === "Staffs") return getStaffLabel(raw);
    if (entType === "Professions") return getProfLabel(raw);
    if (entType === "Replacings") return getReplacingLabel(raw);
    if (entType === "Grants") return getGrantLabel(raw);
    return `${entType}:${raw}`;
  };

  // ----------------------------------------------------
  // 1. Трассировка CHECK
  // ----------------------------------------------------
  if (type === "check") {
    if (!allowed) {
      const [uType, uId] = (user || "").split(":");
      const [oType, oId] = (object || "").split(":");
      return {
        allowed: false,
        nodes: [
          { id: user, type: uType, label: getEntityLabel(uType, uId || user), roleTag: "Субъект" },
          { id: object, type: oType, label: getEntityLabel(oType, oId || object), roleTag: "Целевой объект" }
        ],
        edges: [
          { from: user, to: object, relation, status: "denied" }
        ],
        modelSteps: [
          { from: uType, to: oType, relation, status: "denied" }
        ],
        summary: `✗ Путь отсутствует: ${getEntityLabel(uType, uId || user)} —/—[ ${relation} ]—/—> ${getEntityLabel(oType, oId || object)} (ЗАПРЕЩЕНО)`
      };
    }

    const [uType, uId] = (user || "").split(":");
    const [oType, oId] = (object || "").split(":");

    const getSubChain = (startId) => {
      const chain = [];
      let curr = startId;
      const seen = new Set([curr]);
      while (curr) {
        const rep = replacings.find(r => r.replacing_username === curr);
        if (rep && rep.replaced_username && !seen.has(rep.replaced_username)) {
          chain.push(rep.replaced_username);
          seen.add(rep.replaced_username);
          curr = rep.replaced_username;
        } else {
          break;
        }
      }
      return chain;
    };

    const isFirstOnly = (relation === "can_use_direct" || relation === "assignee_direct" || relation === "employee_direct" || relation === "substitute_direct_assignee" || relation === "substitute_direct_employee");

    // 1.1 Сотрудник -> Роль
    if (uType === "Employees" && oType === "Roles") {
      const isRegular = roles.some(r => r.id === oId && r.username === uId);
      const directGrant = grants.find(g => g.target_id === oId && g.grantee_id === uId);
      if (isRegular || directGrant) {
        return {
          allowed: true,
          nodes: [
            { id: user, type: "Employees", label: getEmpLabel(uId), roleTag: "Сотрудник" },
            { id: object, type: "Roles", label: getRoleLabel(oId), roleTag: directGrant ? "Роль (по гранту)" : "Роль" }
          ],
          edges: [
            { from: user, to: object, relation: "direct_assignee", step: 1 }
          ],
          modelSteps: [
            { from: "Employees", to: "Roles", relation: "direct_assignee" }
          ],
          summary: `${uId} ➔ [direct_assignee] ➔ ${getRoleLabel(oId)}${directGrant ? " (назначена по гранту)" : ""}`
        };
      }

      // По замещению (с учетом цепочки и грантов)
      const fullChain = getSubChain(uId);
      if (fullChain.length > 0) {
        const effectiveChain = isFirstOnly ? fullChain.slice(0, 1) : fullChain;
        const matchIdx = effectiveChain.findIndex(personId =>
          roles.some(r => r.id === oId && r.username === personId) ||
          grants.some(g => g.target_id === oId && g.grantee_id === personId)
        );
        if (matchIdx !== -1) {
          const ownerId = effectiveChain[matchIdx];
          const isGrant = !roles.some(r => r.id === oId && r.username === ownerId);
          const involvedChain = effectiveChain.slice(0, matchIdx + 1);
          const nodes = [
            { id: user, type: "Employees", label: getEmpLabel(uId), roleTag: "Замещающий" }
          ];
          const edges = [];
          let prev = user;
          let step = 1;
          involvedChain.forEach((pId, i) => {
            const pNodeId = `Employees:${pId}`;
            const isLast = (i === involvedChain.length - 1);
            nodes.push({
              id: pNodeId,
              type: "Employees",
              label: getEmpLabel(pId),
              roleTag: isLast ? (isGrant ? "Владелец роли (по гранту)" : "Владелец роли") : `Замещаемый (уровень ${i + 1})`
            });
            edges.push({
              from: prev,
              to: pNodeId,
              relation: "replaces",
              step: step++
            });
            prev = pNodeId;
          });
          nodes.push({ id: object, type: "Roles", label: getRoleLabel(oId), roleTag: isGrant ? "Целевая роль (грант)" : "Целевая роль" });
          edges.push({
            from: prev,
            to: object,
            relation: "direct_assignee",
            step: step
          });

          return {
            allowed: true,
            nodes,
            edges,
            modelSteps: [
              { from: "Employees", to: "Employees", relation: "replaces", step: 1 },
              { from: "Employees", to: "Roles", relation: "assignee", step: 2 }
            ],
            summary: `${[uId, ...involvedChain].join(" ➔ [replaces] ➔ ")} ➔ [direct_assignee] ➔ ${getRoleLabel(oId)}${isGrant ? " (выдана по гранту)" : ""}${matchIdx > 0 ? ` (уровень ${matchIdx + 1})` : ""}`
          };
        }

        // Если в режиме 1-го уровня заблокировано, но в полной цепочке есть:
        if (isFirstOnly && fullChain.some(pId =>
          roles.some(r => r.id === oId && r.username === pId) ||
          grants.some(g => g.target_id === oId && g.grantee_id === pId)
        )) {
          return {
            allowed: false,
            nodes: [
              { id: user, type: "Employees", label: getEmpLabel(uId), roleTag: "Замещающий" },
              { id: `Employees:${fullChain[0]}`, type: "Employees", label: getEmpLabel(fullChain[0]), roleTag: "1-й уровень" },
              { id: object, type: "Roles", label: getRoleLabel(oId), roleTag: "Целевая роль" }
            ],
            edges: [
              { from: user, to: `Employees:${fullChain[0]}`, relation: "replaces", step: 1 },
              { from: `Employees:${fullChain[0]}`, to: object, relation: "direct_assignee", status: "denied" }
            ],
            modelSteps: [
              { from: "Employees", to: "Roles", relation: "assignee_direct", status: "denied" }
            ],
            summary: `✗ Ограничение 1-го уровня: ${uId} замещает ${fullChain[0]}, но роль принадлежит следующему звену цепочки (ЗАПРЕЩЕНО в режиме 1-го уровня)`
          };
        }
      }
    }

    // 1.2 Сотрудник -> Подразделение
    if (uType === "Employees" && oType === "Divisions") {
      const emp = employees.find(e => e.username === uId);
      const isDirect = (emp && emp.division_id === oId);
      const isGrant = grants.some(g => g.grantee_id === uId && g.target_id === oId);
      if (isDirect || isGrant) {
        return {
          allowed: true,
          nodes: [
            { id: user, type: "Employees", label: getEmpLabel(uId), roleTag: "Сотрудник" },
            { id: object, type: "Divisions", label: getDivLabel(oId), roleTag: isGrant ? "Отдел (по гранту)" : "Прямой отдел" }
          ],
          edges: [
            { from: user, to: object, relation: "direct_employee", step: 1 }
          ],
          modelSteps: [
            { from: "Employees", to: "Divisions", relation: "direct_division", step: 1 }
          ],
          summary: `${uId} ➔ [direct_division] ➔ ${getDivLabel(oId)}${isGrant ? " (по гранту)" : ""}`
        };
      }

      // По замещению в подразделении (с учетом цепочки и грантов)
      const fullChain = getSubChain(uId);
      if (fullChain.length > 0) {
        const effectiveChain = isFirstOnly ? fullChain.slice(0, 1) : fullChain;
        for (let i = 0; i < effectiveChain.length; i++) {
          const personId = effectiveChain[i];
          const pEmp = employees.find(e => e.username === personId);
          const pGrant = grants.find(g => g.grantee_id === personId && g.target_id === oId);
          const pDivId = pGrant ? oId : (pEmp ? pEmp.division_id : null);
          const pDiv = divisions.find(d => d.id === pDivId);
          const isDirMatch = (pDivId === oId);
          const targetDiv = divisions.find(d => d.id === oId);
          const isDescendant = !isDirMatch && targetDiv && targetDiv.full_code && pDiv && targetDiv.full_code.startsWith(pDiv.code || pDiv.id);

          if (isDirMatch || isDescendant) {
            const involvedChain = effectiveChain.slice(0, i + 1);
            const nodes = [
              { id: user, type: "Employees", label: getEmpLabel(uId), roleTag: "Замещающий" }
            ];
            const edges = [];
            let prev = user;
            let step = 1;
            involvedChain.forEach((pId, idx) => {
              const pNodeId = `Employees:${pId}`;
              const isLast = (idx === involvedChain.length - 1);
              nodes.push({
                id: pNodeId,
                type: "Employees",
                label: getEmpLabel(pId),
                roleTag: isLast ? (pGrant ? "Замещаемый (отдел по гранту)" : (involvedChain.length === 1 ? "Замещаемый сотрудник" : `Замещаемый (ур. ${idx + 1})`)) : `Замещаемый (ур. ${idx + 1})`
              });
              edges.push({
                from: prev,
                to: pNodeId,
                relation: "replaces",
                step: step++
              });
              prev = pNodeId;
            });
            nodes.push({ id: `Divisions:${pDivId}`, type: "Divisions", label: getDivLabel(pDivId), roleTag: "Отдел замещаемого сотрудника" });
            edges.push({
              from: prev,
              to: `Divisions:${pDivId}`,
              relation: "direct_employee",
              step: step++
            });
            if (!isDirMatch) {
              nodes.push({ id: object, type: "Divisions", label: getDivLabel(oId), roleTag: "Целевой подотдел" });
              edges.push({
                from: `Divisions:${pDivId}`,
                to: object,
                relation: "descendant",
                step: step
              });
            }
            return {
              allowed: true,
              nodes,
              edges,
              modelSteps: [
                { from: "Employees", to: "Employees", relation: "replaces", step: 1 },
                { from: "Employees", to: "Divisions", relation: "employee", step: 2 },
                ...(isDirMatch ? [] : [{ from: "Divisions", to: "Divisions", relation: "descendant", step: 3 }])
              ],
              summary: `${[uId, ...involvedChain].join(" ➔ [replaces] ➔ ")} ➔ [direct_employee] ➔ ${pDivId}${isDirMatch ? "" : ` ➔ [descendant] ➔ ${oId}`}${pGrant ? " (по гранту)" : ""}`
            };
          }
        }

        if (isFirstOnly) {
          const firstPId = fullChain[0];
          const rest = fullChain.slice(1);
          const hasChainMatch = rest.some(pId => {
            const pEmp = employees.find(e => e.username === pId);
            const pGrant = grants.find(g => g.grantee_id === pId && g.target_id === oId);
            const pDivId = pGrant ? oId : (pEmp ? pEmp.division_id : null);
            const pDiv = divisions.find(d => d.id === pDivId);
            const isDir = (pDivId === oId);
            const tDiv = divisions.find(d => d.id === oId);
            const isDesc = !isDir && tDiv && tDiv.full_code && pDiv && tDiv.full_code.startsWith(pDiv.code || pDiv.id);
            return isDir || isDesc;
          });
          if (hasChainMatch) {
            return {
              allowed: false,
              nodes: [
                { id: user, type: "Employees", label: getEmpLabel(uId), roleTag: "Замещающий" },
                { id: `Employees:${firstPId}`, type: "Employees", label: getEmpLabel(firstPId), roleTag: "1-й уровень" },
                { id: object, type: "Divisions", label: getDivLabel(oId), roleTag: "Целевой отдел" }
              ],
              edges: [
                { from: user, to: `Employees:${firstPId}`, relation: "replaces", step: 1 },
                { from: `Employees:${firstPId}`, to: object, relation: "employee", status: "denied" }
              ],
              modelSteps: [
                { from: "Employees", to: "Divisions", relation: "employee_direct", status: "denied" }
              ],
              summary: `✗ Ограничение 1-го уровня: ${uId} замещает ${firstPId}, но отдел ${oId} принадлежит следующему звену цепочки (ЗАПРЕЩЕНО в режиме 1-го уровня)`
            };
          }
        }
      }
    }

    // 1.3 Сотрудник -> Штатная единица
    if (uType === "Employees" && oType === "Staffs") {
      const emp = employees.find(e => e.username === uId);
      const isDirectStaff = emp && emp.staff_id === oId;
      const isGrantStaff = grants.some(g => g.grantee_id === uId && g.target_id === oId);
      if (isDirectStaff || isGrantStaff) {
        return {
          allowed: true,
          nodes: [
            { id: user, type: "Employees", label: getEmpLabel(uId), roleTag: "Сотрудник" },
            { id: object, type: "Staffs", label: getStaffLabel(oId), roleTag: isGrantStaff ? "Штатка (по гранту)" : "Своя штатка" }
          ],
          edges: [
            { from: user, to: object, relation: "direct_staff", step: 1 }
          ],
          modelSteps: [
            { from: "Employees", to: "Staffs", relation: "direct_staff", step: 1 }
          ],
          summary: `${uId} ➔ [direct_staff] ➔ ${getStaffLabel(oId)}${isGrantStaff ? " (по гранту)" : ""}`
        };
      }

      // По замещению на штатке (с учетом цепочки и грантов)
      const fullChain = getSubChain(uId);
      if (fullChain.length > 0) {
        const effectiveChain = isFirstOnly ? fullChain.slice(0, 1) : fullChain;
        for (let i = 0; i < effectiveChain.length; i++) {
          const personId = effectiveChain[i];
          const pEmp = employees.find(e => e.username === personId);
          const pRep = replacings.find(r => r.replacing_username === personId);
          const pGrant = grants.find(g => g.grantee_id === personId && g.target_id === oId);
          const matchStaff = pGrant || (pEmp && pEmp.staff_id === oId) || (pRep && pRep.staff_id === oId);
          if (matchStaff) {
            const involvedChain = effectiveChain.slice(0, i + 1);
            const nodes = [
              { id: user, type: "Employees", label: getEmpLabel(uId), roleTag: "Замещающий" }
            ];
            const edges = [];
            let prev = user;
            let step = 1;
            involvedChain.forEach((pId, idx) => {
              const pNodeId = `Employees:${pId}`;
              const isLast = (idx === involvedChain.length - 1);
              nodes.push({
                id: pNodeId,
                type: "Employees",
                label: getEmpLabel(pId),
                roleTag: isLast ? (pGrant ? "Замещаемый (штатка по гранту)" : (involvedChain.length === 1 ? "Замещаемый сотрудник" : `Замещаемый (ур. ${idx + 1})`)) : `Замещаемый (ур. ${idx + 1})`
              });
              edges.push({
                from: prev,
                to: pNodeId,
                relation: "replaces",
                step: step++
              });
              prev = pNodeId;
            });
            nodes.push({ id: object, type: "Staffs", label: getStaffLabel(oId), roleTag: pGrant ? "Штатка замещаемого (грант)" : "Штатка замещаемого сотрудника" });
            edges.push({
              from: prev,
              to: object,
              relation: "direct_staff",
              step: step
            });
            return {
              allowed: true,
              nodes,
              edges,
              modelSteps: [
                { from: "Employees", to: "Employees", relation: "replaces", step: 1 },
                { from: "Employees", to: "Staffs", relation: "staff", step: 2 }
              ],
              summary: `${[uId, ...involvedChain].join(" ➔ [replaces] ➔ ")} ➔ [direct_staff] ➔ ${getStaffLabel(oId)}${pGrant ? " (по гранту)" : ""}`
            };
          }
        }
      }
    }

    // 1.4 Сотрудник -> Профессия
    if (uType === "Employees" && oType === "Professions") {
      const emp = employees.find(e => e.username === uId);
      const isDirectProf = emp && emp.profession_code === oId;
      const isGrantProf = grants.some(g => g.grantee_id === uId && g.target_id === oId);
      if (isDirectProf || isGrantProf) {
        return {
          allowed: true,
          nodes: [
            { id: user, type: "Employees", label: getEmpLabel(uId), roleTag: "Сотрудник" },
            { id: object, type: "Professions", label: getProfLabel(oId), roleTag: isGrantProf ? "Профессия (по гранту)" : "Своя профессия" }
          ],
          edges: [
            { from: user, to: object, relation: "direct_profession", step: 1 }
          ],
          modelSteps: [
            { from: "Employees", to: "Professions", relation: "direct_profession", step: 1 }
          ],
          summary: `${uId} ➔ [direct_profession] ➔ ${getProfLabel(oId)}${isGrantProf ? " (по гранту)" : ""}`
        };
      }

      // По замещению на профессии
      const fullChain = getSubChain(uId);
      if (fullChain.length > 0) {
        const effectiveChain = isFirstOnly ? fullChain.slice(0, 1) : fullChain;
        for (let i = 0; i < effectiveChain.length; i++) {
          const personId = effectiveChain[i];
          const pEmp = employees.find(e => e.username === personId);
          const pGrant = grants.find(g => g.grantee_id === personId && g.target_id === oId);
          const matchProf = pGrant || (pEmp && pEmp.profession_code === oId);
          if (matchProf) {
            const involvedChain = effectiveChain.slice(0, i + 1);
            const nodes = [
              { id: user, type: "Employees", label: getEmpLabel(uId), roleTag: "Замещающий" }
            ];
            const edges = [];
            let prev = user;
            let step = 1;
            involvedChain.forEach((pId, idx) => {
              const pNodeId = `Employees:${pId}`;
              const isLast = (idx === involvedChain.length - 1);
              nodes.push({
                id: pNodeId,
                type: "Employees",
                label: getEmpLabel(pId),
                roleTag: isLast ? (pGrant ? "Замещаемый (профессия по гранту)" : (involvedChain.length === 1 ? "Замещаемый сотрудник" : `Замещаемый (ур. ${idx + 1})`)) : `Замещаемый (ур. ${idx + 1})`
              });
              edges.push({
                from: prev,
                to: pNodeId,
                relation: "replaces",
                step: step++
              });
              prev = pNodeId;
            });
            nodes.push({ id: object, type: "Professions", label: getProfLabel(oId), roleTag: pGrant ? "Профессия замещаемого (грант)" : "Профессия замещаемого сотрудника" });
            edges.push({
              from: prev,
              to: object,
              relation: "direct_profession",
              step: step
            });
            return {
              allowed: true,
              nodes,
              edges,
              modelSteps: [
                { from: "Employees", to: "Employees", relation: "replaces", step: 1 },
                { from: "Employees", to: "Professions", relation: "profession", step: 2 }
              ],
              summary: `${[uId, ...involvedChain].join(" ➔ [replaces] ➔ ")} ➔ [direct_profession] ➔ ${getProfLabel(oId)}${pGrant ? " (по гранту)" : ""}`
            };
          }
        }
      }
    }

    // 1.4 Подразделение -> Подразделение (Иерархия)
    if (uType === "Divisions" && oType === "Divisions") {
      return {
        allowed: true,
        nodes: [
          { id: user, type: "Divisions", label: getDivLabel(uId), roleTag: "Исходный отдел" },
          { id: object, type: "Divisions", label: getDivLabel(oId), roleTag: "Целевой отдел" }
        ],
        edges: [
          { from: user, to: object, relation, step: 1 }
        ],
        modelSteps: [
          { from: "Divisions", to: "Divisions", relation, step: 1 }
        ],
        summary: `${getDivLabel(uId)} ➔ [${relation}] ➔ ${getDivLabel(oId)}`
      };
    }

    // 1.5 Универсальный Check для любых других пар вершин
    return {
      allowed: true,
      nodes: [
        { id: user, type: uType, label: getEntityLabel(uType, uId || user), roleTag: "Субъект" },
        { id: object, type: oType, label: getEntityLabel(oType, oId || object), roleTag: "Целевой объект" }
      ],
      edges: [
        { from: user, to: object, relation, step: 1 }
      ],
      modelSteps: [
        { from: uType, to: oType, relation, step: 1 }
      ],
      summary: `${getEntityLabel(uType, uId || user)} ➔ [${relation}] ➔ ${getEntityLabel(oType, oId || object)}`
    };
  }

  // ----------------------------------------------------
  // 2. Трассировка LOOKUP
  // ----------------------------------------------------
  if (type === "lookup") {
    const rootId = user || object || "";
    const [eType, eId] = rootId.split(":");
    const targetType = userType || "Objects";

    const ownEmp = (eType === "Employees") ? employees.find(e => e.username === eId) : null;
    const rep = (eType === "Employees") ? replacings.find(r => r.replacing_username === eId) : null;
    const repId = rep ? rep.replaced_username : null;
    const repEmp = repId ? employees.find(e => e.username === repId) : null;

    // 2.1 Сотрудник -> Подразделения
    if (eType === "Employees" && targetType === "Divisions") {
      const nodes = [
        { id: `Employees:${eId}`, type: "Employees", label: getEmpLabel(eId), roleTag: "Сотрудник" }
      ];
      const edges = [];
      const modelSteps = [];

      const isDirectOnly = (relation === "direct_division");
      const isFromReplacedOnly = (relation === "division_from_replaced" || relation === "descendant_division_from_replaced");
      const isAllDivisions = (relation === "all_divisions" || relation === "all_divisions_direct" || relation === "all_divisions_chain" || relation === "can_use");

      // 1) Свое прямое подразделение (если запрос не строго "division_from_replaced")
      if (!isFromReplacedOnly && ownEmp && ownEmp.division_id) {
        const ownDivNodeId = `Divisions:${ownEmp.division_id}`;
        nodes.push({
          id: ownDivNodeId,
          type: "Divisions",
          label: getDivLabel(ownEmp.division_id),
          roleTag: "Свое подразделение"
        });
        edges.push({
          from: `Employees:${eId}`,
          to: ownDivNodeId,
          relation: "direct_division",
          step: 1
        });
        modelSteps.push({ from: "Employees", to: "Divisions", relation: "direct_division", step: 1 });

        // Если есть подчиненные/вышестоящие подотделы из items
        if (relation === "ancestor_division" || relation === "division") {
          items.filter(id => id !== ownEmp.division_id).slice(0, 3).forEach(ancId => {
            const ancNodeId = `Divisions:${ancId}`;
            nodes.push({ id: ancNodeId, type: "Divisions", label: getDivLabel(ancId), roleTag: "Вышестоящий отдел" });
            edges.push({ from: ownDivNodeId, to: ancNodeId, relation: "ancestor", step: 2 });
          });
          modelSteps.push({ from: "Divisions", to: "Divisions", relation: "ancestor", step: 2 });
        } else if (relation === "descendant_division") {
          items.filter(id => id !== ownEmp.division_id).slice(0, 3).forEach(descId => {
            const descNodeId = `Divisions:${descId}`;
            nodes.push({ id: descNodeId, type: "Divisions", label: getDivLabel(descId), roleTag: "Подчиненный отдел" });
            edges.push({ from: ownDivNodeId, to: descNodeId, relation: "descendant", step: 2 });
          });
          modelSteps.push({ from: "Divisions", to: "Divisions", relation: "descendant", step: 2 });
        }
      }

      // 2) Ветка замещения (division_from_replaced, descendant_division_from_replaced, all_divisions...)
      if ((isFromReplacedOnly || isAllDivisions) && rep && repId && repEmp && repEmp.division_id) {
        const repNodeId = `Employees:${repId}`;
        const repDivNodeId = `Divisions:${repEmp.division_id}`;

        nodes.push({
          id: repNodeId,
          type: "Employees",
          label: getEmpLabel(repId),
          roleTag: "Замещаемый сотрудник"
        });
        edges.push({
          from: `Employees:${eId}`,
          to: repNodeId,
          relation: "replaces",
          step: 1
        });
        modelSteps.push({ from: "Employees", to: "Employees", relation: "replaces", step: 1 });

        nodes.push({
          id: repDivNodeId,
          type: "Divisions",
          label: getDivLabel(repEmp.division_id),
          roleTag: "Отдел замещаемого сотрудника"
        });
        edges.push({
          from: repNodeId,
          to: repDivNodeId,
          relation: "direct_division",
          step: 2
        });
        modelSteps.push({ from: "Employees", to: "Divisions", relation: "division_from_replaced", step: 2 });

        if (relation === "descendant_division_from_replaced") {
          items.filter(id => id !== repEmp.division_id).slice(0, 3).forEach(descId => {
            const descNodeId = `Divisions:${descId}`;
            nodes.push({ id: descNodeId, type: "Divisions", label: getDivLabel(descId), roleTag: "Подчиненный отдел замещаемого" });
            edges.push({ from: repDivNodeId, to: descNodeId, relation: "descendant", step: 3 });
          });
          modelSteps.push({ from: "Divisions", to: "Divisions", relation: "descendant", step: 3 });
        }
      }

      // Если ни одна ветка не построилась, берем items напрямую
      if (edges.length === 0 && items.length > 0) {
        items.slice(0, 3).forEach((dId, idx) => {
          const dNodeId = `Divisions:${dId}`;
          nodes.push({ id: dNodeId, type: "Divisions", label: getDivLabel(dId), roleTag: `Подразделение ${idx + 1}` });
          edges.push({ from: `Employees:${eId}`, to: dNodeId, relation, step: 1 });
        });
        modelSteps.push({ from: "Employees", to: "Divisions", relation, step: 1 });
      }

      return {
        nodes,
        edges,
        modelSteps,
        summary: `Выборка отделов для ${eId} (${relation}): найдено подразделений: ${items.length}`
      };
    }

    // 2.2 Сотрудник -> Штатки (Staffs)
    if (eType === "Employees" && targetType === "Staffs") {
      const nodes = [
        { id: `Employees:${eId}`, type: "Employees", label: getEmpLabel(eId), roleTag: "Сотрудник" }
      ];
      const edges = [];
      const modelSteps = [];

      const isFromReplacedOnly = (relation === "staff_from_replaced");
      const isDirectOnly = (relation === "direct_staff");

      // 1) Своя штатка
      if (!isFromReplacedOnly && ownEmp && ownEmp.staff_id) {
        const staffNodeId = `Staffs:${ownEmp.staff_id}`;
        nodes.push({
          id: staffNodeId,
          type: "Staffs",
          label: getStaffLabel(ownEmp.staff_id),
          roleTag: "Своя штатка"
        });
        edges.push({
          from: `Employees:${eId}`,
          to: staffNodeId,
          relation: "direct_staff",
          step: 1
        });
        modelSteps.push({ from: "Employees", to: "Staffs", relation: "direct_staff", step: 1 });
      }

      // 2) Штатка замещаемого сотрудника
      if (!isDirectOnly && rep && repId) {
        const repStaffId = rep.staff_id || (repEmp && repEmp.staff_id);
        if (repStaffId) {
          const repNodeId = `Employees:${repId}`;
          const repStaffNodeId = `Staffs:${repStaffId}`;

          nodes.push({
            id: repNodeId,
            type: "Employees",
            label: getEmpLabel(repId),
            roleTag: "Замещаемый сотрудник"
          });
          edges.push({
            from: `Employees:${eId}`,
            to: repNodeId,
            relation: "replaces",
            step: 1
          });
          modelSteps.push({ from: "Employees", to: "Employees", relation: "replaces", step: 1 });

          nodes.push({
            id: repStaffNodeId,
            type: "Staffs",
            label: getStaffLabel(repStaffId),
            roleTag: "Штатка замещаемого сотрудника"
          });
          edges.push({
            from: repNodeId,
            to: repStaffNodeId,
            relation: "direct_staff",
            step: 2
          });
          modelSteps.push({ from: "Employees", to: "Staffs", relation: "staff", step: 2 });
        }
      }

      if (edges.length === 0 && items.length > 0) {
        items.slice(0, 3).forEach((sId, idx) => {
          const sNodeId = `Staffs:${sId}`;
          nodes.push({ id: sNodeId, type: "Staffs", label: getStaffLabel(sId), roleTag: `Штатка ${idx + 1}` });
          edges.push({ from: `Employees:${eId}`, to: sNodeId, relation, step: 1 });
        });
        modelSteps.push({ from: "Employees", to: "Staffs", relation, step: 1 });
      }

      return {
        nodes,
        edges,
        modelSteps,
        summary: `Выборка штаток для ${eId} (${relation}): найдено позиций: ${items.length}`
      };
    }

    // 2.3 Сотрудник -> Профессии (Professions)
    if (eType === "Employees" && targetType === "Professions") {
      const nodes = [
        { id: `Employees:${eId}`, type: "Employees", label: getEmpLabel(eId), roleTag: "Сотрудник" }
      ];
      const edges = [];
      const modelSteps = [];

      const isFromReplacedOnly = (relation === "profession_from_replaced");
      const isDirectOnly = (relation === "direct_profession");

      if (!isFromReplacedOnly && ownEmp && ownEmp.profession_code) {
        const profNodeId = `Professions:${ownEmp.profession_code}`;
        nodes.push({
          id: profNodeId,
          type: "Professions",
          label: getProfLabel(ownEmp.profession_code),
          roleTag: "Своя профессия"
        });
        edges.push({
          from: `Employees:${eId}`,
          to: profNodeId,
          relation: "direct_profession",
          step: 1
        });
        modelSteps.push({ from: "Employees", to: "Professions", relation: "direct_profession", step: 1 });
      }

      if (!isDirectOnly && rep && repId && repEmp && repEmp.profession_code) {
        const repNodeId = `Employees:${repId}`;
        const repProfNodeId = `Professions:${repEmp.profession_code}`;

        nodes.push({
          id: repNodeId,
          type: "Employees",
          label: getEmpLabel(repId),
          roleTag: "Замещаемый сотрудник"
        });
        edges.push({
          from: `Employees:${eId}`,
          to: repNodeId,
          relation: "replaces",
          step: 1
        });
        modelSteps.push({ from: "Employees", to: "Employees", relation: "replaces", step: 1 });

        nodes.push({
          id: repProfNodeId,
          type: "Professions",
          label: getProfLabel(repEmp.profession_code),
          roleTag: "Профессия замещаемого сотрудника"
        });
        edges.push({
          from: repNodeId,
          to: repProfNodeId,
          relation: "direct_profession",
          step: 2
        });
        modelSteps.push({ from: "Employees", to: "Professions", relation: "profession", step: 2 });
      }

      if (edges.length === 0 && items.length > 0) {
        items.slice(0, 3).forEach((pCode, idx) => {
          const pNodeId = `Professions:${pCode}`;
          nodes.push({ id: pNodeId, type: "Professions", label: getProfLabel(pCode), roleTag: `Профессия ${idx + 1}` });
          edges.push({ from: `Employees:${eId}`, to: pNodeId, relation, step: 1 });
        });
        modelSteps.push({ from: "Employees", to: "Professions", relation, step: 1 });
      }

      return {
        nodes,
        edges,
        modelSteps,
        summary: `Выборка профессий для ${eId} (${relation}): найдено профессий: ${items.length}`
      };
    }

    // 2.4 Сотрудник -> Роли (Roles)
    if (eType === "Employees" && targetType === "Roles") {
      const nodes = [
        { id: `Employees:${eId}`, type: "Employees", label: getEmpLabel(eId), roleTag: "Сотрудник" }
      ];
      const edges = [];
      const modelSteps = [];

      const isFromReplacedOnly = (relation === "role_from_replaced");
      const isDirectOnly = (relation === "direct_role");
      const isGrantOnly = (relation === "grant_role");

      // 1) Личные роли сотрудника (включая полученные по грантам)
      if (!isFromReplacedOnly) {
        const directRoleIds = items.filter(rId =>
          roles.some(r => r.id === rId && r.username === eId) ||
          grants.some(g => g.grantee_id === eId && g.target_id === rId)
        );
        directRoleIds.slice(0, 3).forEach(rId => {
          const isGrant = !roles.some(r => r.id === rId && r.username === eId);
          const rNodeId = `Roles:${rId}`;
          nodes.push({ id: rNodeId, type: "Roles", label: getRoleLabel(rId), roleTag: isGrant ? "Личная роль (грант)" : "Личная роль" });
          edges.push({ from: `Employees:${eId}`, to: rNodeId, relation: "direct_assignee", step: 1 });
        });
        if (directRoleIds.length > 0) {
          modelSteps.push({ from: "Employees", to: "Roles", relation: "direct_assignee", step: 1 });
        }
      }

      // 2) Роли по замещению (включая гранты замещаемого)
      if (!isDirectOnly && rep && repId) {
        const repRoleIds = items.filter(rId =>
          roles.some(r => r.id === rId && r.username === repId) ||
          grants.some(g => g.grantee_id === repId && g.target_id === rId)
        );
        if (repRoleIds.length > 0 || isFromReplacedOnly) {
          const repNodeId = `Employees:${repId}`;
          nodes.push({ id: repNodeId, type: "Employees", label: getEmpLabel(repId), roleTag: "Замещаемый сотрудник" });
          edges.push({ from: `Employees:${eId}`, to: repNodeId, relation: "replaces", step: 1 });
          modelSteps.push({ from: "Employees", to: "Employees", relation: "replaces", step: 1 });

          (repRoleIds.length > 0 ? repRoleIds : items).slice(0, 3).forEach(rId => {
            const isGrant = !roles.some(r => r.id === rId && r.username === repId);
            const rNodeId = `Roles:${rId}`;
            nodes.push({ id: rNodeId, type: "Roles", label: getRoleLabel(rId), roleTag: isGrant ? "Роль замещаемого (грант)" : "Роль замещаемого" });
            edges.push({ from: repNodeId, to: rNodeId, relation: "direct_assignee", step: 2 });
          });
          modelSteps.push({ from: "Employees", to: "Roles", relation: "assignee", step: 2 });
        }
      }

      if (edges.length === 0 && items.length > 0) {
        items.slice(0, 3).forEach((rId, idx) => {
          const rNodeId = `Roles:${rId}`;
          nodes.push({ id: rNodeId, type: "Roles", label: getRoleLabel(rId), roleTag: `Роль ${idx + 1}` });
          edges.push({ from: `Employees:${eId}`, to: rNodeId, relation, step: 1 });
        });
        modelSteps.push({ from: "Employees", to: "Roles", relation, step: 1 });
      }

      return {
        nodes,
        edges,
        modelSteps,
        summary: `Выборка ролей для ${eId} (${relation}): найдено ролей: ${items.length}`
      };
    }

    // 2.5 Сотрудник -> Другие сотрудники (replaces_direct, replaces_chain, substitute_direct, substitute_chain)
    if (eType === "Employees" && targetType === "Employees") {
      const nodes = [
        { id: `Employees:${eId}`, type: "Employees", label: getEmpLabel(eId), roleTag: "Сотрудник" }
      ];
      const edges = [];
      const modelSteps = [
        { from: "Employees", to: "Employees", relation, step: 1 }
      ];

      if (relation.startsWith("replaces") || relation === "direct_replaces") {
        let prev = `Employees:${eId}`;
        items.forEach((pId, idx) => {
          const pNodeId = `Employees:${pId}`;
          nodes.push({
            id: pNodeId,
            type: "Employees",
            label: getEmpLabel(pId),
            roleTag: idx === 0 ? "Замещаемый сотрудник" : `Замещаемый (ур. ${idx + 1})`
          });
          edges.push({
            from: prev,
            to: pNodeId,
            relation: "replaces",
            step: idx + 1
          });
          prev = pNodeId;
        });
      } else {
        items.forEach((subId, idx) => {
          const subNodeId = `Employees:${subId}`;
          nodes.push({
            id: subNodeId,
            type: "Employees",
            label: getEmpLabel(subId),
            roleTag: `Замещающий ${idx + 1}`
          });
          edges.push({
            from: `Employees:${eId}`,
            to: subNodeId,
            relation: "substitute",
            step: 1
          });
        });
      }

      return {
        nodes,
        edges,
        modelSteps,
        summary: `Связи замещений для ${eId} (${relation}): найдено сотрудников: ${items.length}`
      };
    }

    // 2.6 Подразделение -> Подчиненные отделы (descendant / child / parent / ancestor)
    if (eType === "Divisions" && targetType === "Divisions") {
      const sampleChildren = items.slice(0, 4);
      const nodes = [
        { id: `Divisions:${eId}`, type: "Divisions", label: getDivLabel(eId), roleTag: "Исходный отдел" }
      ];
      const edges = [];
      sampleChildren.forEach((childId, idx) => {
        nodes.push({ id: `Divisions:${childId}`, type: "Divisions", label: getDivLabel(childId), roleTag: `Связанный отдел ${idx + 1}` });
        edges.push({ from: `Divisions:${eId}`, to: `Divisions:${childId}`, relation, step: 1 });
      });

      return {
        nodes,
        edges,
        modelSteps: [
          { from: "Divisions", to: "Divisions", relation, step: 1 }
        ],
        summary: `${getDivLabel(eId)} ➔ [${relation}] ➔ ${items.length} подразделений`
      };
    }

    // 2.7 Подразделение -> Сотрудники (direct_employee, substitute_direct_employee, etc.)
    if (eType === "Divisions" && targetType === "Employees") {
      const nodes = [
        { id: `Divisions:${eId}`, type: "Divisions", label: getDivLabel(eId), roleTag: "Подразделение" }
      ];
      const edges = [];
      const modelSteps = [];

      if (relation === "direct_employee" || relation === "employee") {
        items.slice(0, 4).forEach((u, idx) => {
          nodes.push({ id: `Employees:${u}`, type: "Employees", label: getEmpLabel(u), roleTag: `Сотрудник ${idx + 1}` });
          edges.push({ from: `Divisions:${eId}`, to: `Employees:${u}`, relation: "direct_employee", step: 1 });
        });
        modelSteps.push({ from: "Divisions", to: "Employees", relation: "direct_employee", step: 1 });
      } else if (relation.startsWith("substitute")) {
        const sampleSubs = items.slice(0, 3);
        sampleSubs.forEach((subId, idx) => {
          const repRecord = replacings.find(r => r.replacing_username === subId);
          const replacedBossId = repRecord ? repRecord.replaced_username : null;
          const subNodeId = `Employees:${subId}`;

          if (replacedBossId) {
            const bossNodeId = `Employees:${replacedBossId}`;
            if (!nodes.some(n => n.id === bossNodeId)) {
              nodes.push({ id: bossNodeId, type: "Employees", label: getEmpLabel(replacedBossId), roleTag: "Сотрудник отдела" });
              edges.push({ from: `Divisions:${eId}`, to: bossNodeId, relation: "direct_employee", step: 1 });
            }
            nodes.push({ id: subNodeId, type: "Employees", label: getEmpLabel(subId), roleTag: `Замещающий ${idx + 1}` });
            edges.push({ from: bossNodeId, to: subNodeId, relation: "substitute", step: 2 });
          } else {
            nodes.push({ id: subNodeId, type: "Employees", label: getEmpLabel(subId), roleTag: `Замещающий ${idx + 1}` });
            edges.push({ from: `Divisions:${eId}`, to: subNodeId, relation: "substitute", step: 1 });
          }
        });
        modelSteps.push({ from: "Divisions", to: "Employees", relation: "employee", step: 1 });
        modelSteps.push({ from: "Employees", to: "Employees", relation: "substitute", step: 2 });
      } else {
        items.slice(0, 4).forEach((u, idx) => {
          nodes.push({ id: `Employees:${u}`, type: "Employees", label: getEmpLabel(u), roleTag: `Сотрудник ${idx + 1}` });
          edges.push({ from: `Divisions:${eId}`, to: `Employees:${u}`, relation, step: 1 });
        });
        modelSteps.push({ from: "Divisions", to: "Employees", relation, step: 1 });
      }

      return {
        nodes,
        edges,
        modelSteps,
        summary: `${getDivLabel(eId)} ➔ [${relation}] ➔ найдено сотрудников: ${items.length}`
      };
    }

    // 2.8 Роли -> Сотрудники (direct_assignee, substitute_direct_assignee, etc.)
    if (eType === "Roles" && targetType === "Employees") {
      const nodes = [
        { id: `Roles:${eId}`, type: "Roles", label: getRoleLabel(eId), roleTag: "Роль" }
      ];
      const edges = [];
      const modelSteps = [];

      if (relation === "direct_assignee") {
        items.slice(0, 4).forEach((u, idx) => {
          nodes.push({ id: `Employees:${u}`, type: "Employees", label: getEmpLabel(u), roleTag: `Обладатель роли ${idx + 1}` });
          edges.push({ from: `Roles:${eId}`, to: `Employees:${u}`, relation: "direct_assignee", step: 1 });
        });
        modelSteps.push({ from: "Roles", to: "Employees", relation: "direct_assignee", step: 1 });
      } else if (relation.startsWith("substitute")) {
        const roleRecord = roles.find(r => r.id === eId);
        const ownerId = roleRecord ? roleRecord.username : null;
        if (ownerId) {
          const ownerNodeId = `Employees:${ownerId}`;
          nodes.push({ id: ownerNodeId, type: "Employees", label: getEmpLabel(ownerId), roleTag: "Владелец роли" });
          edges.push({ from: `Roles:${eId}`, to: ownerNodeId, relation: "direct_assignee", step: 1 });

          items.slice(0, 3).forEach((subId, idx) => {
            const subNodeId = `Employees:${subId}`;
            nodes.push({ id: subNodeId, type: "Employees", label: getEmpLabel(subId), roleTag: `Замещающий ${idx + 1}` });
            edges.push({ from: ownerNodeId, to: subNodeId, relation: "substitute", step: 2 });
          });
          modelSteps.push({ from: "Roles", to: "Employees", relation: "direct_assignee", step: 1 });
          modelSteps.push({ from: "Employees", to: "Employees", relation: "substitute", step: 2 });
        } else {
          items.slice(0, 4).forEach((u, idx) => {
            nodes.push({ id: `Employees:${u}`, type: "Employees", label: getEmpLabel(u), roleTag: `Замещающий ${idx + 1}` });
            edges.push({ from: `Roles:${eId}`, to: `Employees:${u}`, relation, step: 1 });
          });
          modelSteps.push({ from: "Roles", to: "Employees", relation, step: 1 });
        }
      } else {
        items.slice(0, 4).forEach((u, idx) => {
          nodes.push({ id: `Employees:${u}`, type: "Employees", label: getEmpLabel(u), roleTag: `Пользователь ${idx + 1}` });
          edges.push({ from: `Roles:${eId}`, to: `Employees:${u}`, relation, step: 1 });
        });
        modelSteps.push({ from: "Roles", to: "Employees", relation, step: 1 });
      }

      return {
        nodes,
        edges,
        modelSteps,
        summary: `${getRoleLabel(eId)} ➔ [${relation}] ➔ найдено сотрудников: ${items.length}`
      };
    }

    // 2.9 Универсальный Lookup для любых других сущностей
    const fallbackNodes = [
      { id: rootId, type: eType, label: getEntityLabel(eType, eId || rootId), roleTag: "Исходная сущность" }
    ];
    const fallbackEdges = [];
    (items || []).slice(0, 5).forEach((item, idx) => {
      const itId = item.includes(":") ? item : `${targetType}:${item}`;
      fallbackNodes.push({ id: itId, type: targetType, label: getEntityLabel(targetType, item), roleTag: `Результат ${idx + 1}` });
      fallbackEdges.push({ from: rootId, to: itId, relation, step: 1 });
    });

    return {
      nodes: fallbackNodes,
      edges: fallbackEdges,
      modelSteps: [
        { from: eType, to: targetType, relation, step: 1 }
      ],
      summary: `${getEntityLabel(eType, eId || rootId)} ➔ [${relation}] ➔ найдено объектов (${targetType}): ${items.length}`
    };
  }

  // Стандартный fallback
  const fromType = (user || object || "").split(":")[0] || "Employees";
  const toType = userType || (object || "").split(":")[0] || "Roles";
  return {
    nodes: [
      { id: user || object, type: fromType, label: getEntityLabel(fromType, user || object) }
    ],
    edges: [],
    modelSteps: [
      { from: fromType, to: toType, relation: relation || "access" }
    ],
    summary: `${fromType} ➔ [${relation || "access"}] ➔ ${toType}`
  };
}

