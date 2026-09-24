
    function formatLookupItem(id, type) {
      const cleanId = String(id).replace(`${type}:`, "");
      if (type === "Employees") {
        const emp = (tables.employees || []).find(e => e.username === cleanId);
        return emp ? `${cleanId} — ${emp.full_name}` : cleanId;
      }
      if (type === "Divisions") {
        const div = (tables.divisions || []).find(d => String(d.id) === String(cleanId));
        return div ? `${cleanId} — ${div.name}${div.full_code ? ` [${div.full_code}]` : ""}` : cleanId;
      }
      if (type === "Roles") {
        const role = (tables.roles || []).find(r => r.id === cleanId);
        return role ? `${role.role_name} (${cleanId.slice(0, 8)}...)` : cleanId;
      }
      if (type === "Staffs") {
        const s = (tables.staffs || []).find(x => String(x.id) === String(cleanId));
        if (s) {
          const div = (tables.divisions || []).find(d => String(d.id) === String(s.division_id));
          const prof = (tables.professions || []).find(p => String(p.code) === String(s.profession_code));
          return `Штатка ${cleanId} (${prof ? prof.name : s.profession_code} / ${div ? div.name : s.division_id})`;
        }
        return `Штатка ${cleanId}`;
      }
      if (type === "Professions") {
        const prof = (tables.professions || []).find(p => String(p.code) === String(cleanId));
        return prof ? `${cleanId} — ${prof.name}` : cleanId;
      }

      return cleanId;
    }

    function populateEntitySelect(sel, type, defaultValue) {
      if (!sel) return;
      sel.innerHTML = "";

      if (type === "Employees") {
        (tables.employees || []).forEach(e => {
          const opt = document.createElement("option");
          opt.value = `Employees:${e.username}`;
          opt.textContent = formatEmployeeOptionLabel(e, tables);
          sel.appendChild(opt);
        });
        if (defaultValue && Array.from(sel.options).some(o => o.value === defaultValue)) {
          sel.value = defaultValue;
        } else if ((tables.employees || []).some(e => e.username === "34491")) {
          sel.value = "Employees:34491";
        }
      } else if (type === "Divisions") {
        (tables.divisions || []).forEach(d => {
          const opt = document.createElement("option");
          opt.value = `Divisions:${d.id}`;
          opt.textContent = `${d.id} — ${d.name}${d.full_code ? ` [код: ${d.code || d.id}, путь: ${d.full_code}]` : ""}`;
          sel.appendChild(opt);
        });
        if (defaultValue && Array.from(sel.options).some(o => o.value === defaultValue)) {
          sel.value = defaultValue;
        } else if ((tables.divisions || []).some(d => String(d.id) === "755")) {
          sel.value = "Divisions:755";
        }
      } else if (type === "Roles") {
        (tables.roles || []).forEach(r => {
          const opt = document.createElement("option");
          opt.value = `Roles:${r.id}`;
          opt.textContent = `${r.role_name} (${r.id.slice(0, 8)}...)`;
          sel.appendChild(opt);
        });
        if (defaultValue && Array.from(sel.options).some(o => o.value === defaultValue)) {
          sel.value = defaultValue;
        }
      } else if (type === "Staffs") {
        (tables.staffs || []).forEach(s => {
          const opt = document.createElement("option");
          opt.value = `Staffs:${s.id}`;
          const div = (tables.divisions || []).find(d => String(d.id) === String(s.division_id));
          const prof = (tables.professions || []).find(p => String(p.code) === String(s.profession_code));
          opt.textContent = `Штатка ${s.id} (${prof ? prof.name : s.profession_code} / ${div ? div.name : s.division_id})`;
          sel.appendChild(opt);
        });
        if (defaultValue && Array.from(sel.options).some(o => o.value === defaultValue)) {
          sel.value = defaultValue;
        } else if ((tables.staffs || []).some(s => String(s.id) === "17363")) {
          sel.value = "Staffs:17363";
        }
      } else if (type === "Professions") {
        (tables.professions || []).forEach(p => {
          const opt = document.createElement("option");
          opt.value = `Professions:${p.code}`;
          opt.textContent = `${p.code} — ${p.name}`;
          sel.appendChild(opt);
        });
        if (defaultValue && Array.from(sel.options).some(o => o.value === defaultValue)) {
          sel.value = defaultValue;
        }
      }
    }


    let tables = null;
    let modelJson = null;
    let modelFga = "";
    let currentSubjectMode = 'chain';
    let lookupCurrentDependencies = [];

    // Состояние инспектора API
    let currentActiveTab = "check";
    let currentPreviewRequest = { endpoint: "/check", pdpRoute: "/stores/{store_id}/check", payload: {} };
    let lastExecutedRequest = null;
    let lastExecutedResponse = null;

    function showToast(msg) {
      const container = document.getElementById("toastContainer");
      if (!container) return;
      const toast = document.createElement("div");
      toast.className = "toast";
      toast.textContent = msg;
      container.appendChild(toast);
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 2400);
    }

    function copyRequestJson() {
      const jsonReq = document.getElementById("jsonRequest")?.textContent;
      if (!jsonReq) return;
      navigator.clipboard.writeText(jsonReq).then(() => {
        showToast("✓ JSON запроса скопирован в буфер обмена!");
      }).catch(() => {
        prompt("Скопируйте JSON запроса:", jsonReq);
      });
    }

    function copyRequestCurl() {
      const endpoint = currentPreviewRequest?.endpoint || "/check";
      const jsonReq = document.getElementById("jsonRequest")?.textContent || "{}";
      const origin = window.location.origin || "http://localhost:3000";
      let compactPayload = "";
      try {
        compactPayload = JSON.stringify(JSON.parse(jsonReq));
      } catch (e) {
        compactPayload = jsonReq;
      }
      const curlCmd = `curl -X POST "${origin}${endpoint}" \\\n  -H "Content-Type: application/json" \\\n  -d '${compactPayload}'`;
      navigator.clipboard.writeText(curlCmd).then(() => {
        showToast("✓ Команда cURL скопирована в буфер обмена!");
      }).catch(() => {
        prompt("Скопируйте команду cURL:", curlCmd);
      });
    }

    function copyResponseJson() {
      const jsonRes = document.getElementById("jsonResponse")?.textContent;
      if (!jsonRes) return;
      navigator.clipboard.writeText(jsonRes).then(() => {
        showToast("✓ JSON ответа скопирован в буфер обмена!");
      }).catch(() => {
        prompt("Скопируйте JSON ответа:", jsonRes);
      });
    }

    function updateLiveRequestPreview() {
      let endpoint = "/check";
      let pdpRoute = "/stores/{store_id}/check";
      let payload = {};

      if (currentActiveTab === "check") {
        const subType = document.getElementById("checkSubjectType")?.value || "Employees";
        const subItem = document.getElementById("checkSubjectItem")?.value || `${subType}:42179`;
        const targetType = document.getElementById("checkTargetType")?.value || "Divisions";
        const targetItem = document.getElementById("checkTargetItem")?.value || `${targetType}:755`;
        const relation = document.getElementById("checkRelation")?.value || "can_use";

        endpoint = "/check";
        pdpRoute = "/stores/{store_id}/check";
        payload = {
          user: subItem,
          relation: relation,
          object: targetItem
        };

        const ctxEnabled = document.getElementById("enableContextualTuples")?.checked;
        if (ctxEnabled) {
          const rawCtx = document.getElementById("contextualTuplesJson")?.value?.trim();
          if (rawCtx) {
            try {
              const parsed = JSON.parse(rawCtx);
              if (Array.isArray(parsed) && parsed.length > 0) {
                payload.contextual_tuples = parsed;
              }
            } catch (e) {}
          }
        }
      } else if (currentActiveTab === "lookup") {
        const entType = document.getElementById("lookupEntityType")?.value || "Employees";
        const entItem = document.getElementById("lookupEntityItem")?.value || `${entType}:34491`;
        const relSel = document.getElementById("lookupDependencyRel");
        const depIdx = relSel ? parseInt(relSel.value, 10) : 0;
        const dep = (lookupCurrentDependencies && lookupCurrentDependencies[depIdx]) 
          || (lookupCurrentDependencies && lookupCurrentDependencies[0]);

        if (dep) {
          if (dep.method === "list-objects") {
            endpoint = "/list-objects";
            pdpRoute = "/stores/{store_id}/list-objects";
            payload = {
              user: entItem,
              relation: dep.relation,
              type: dep.targetType
            };
          } else {
            endpoint = "/list-users";
            pdpRoute = "/stores/{store_id}/list-users";
            payload = {
              object: entItem,
              relation: dep.relation,
              userType: dep.targetType
            };
          }
        } else {
          endpoint = "/list-objects";
          pdpRoute = "/stores/{store_id}/list-objects";
          payload = {
            user: entItem,
            relation: "all_divisions",
            type: "Divisions"
          };
        }
      } else if (currentActiveTab === "batch") {
        endpoint = "/batch-check";
        pdpRoute = "/stores/{store_id}/batch-check";
        payload = {
          checks: (currentBatchChecks || []).map((c, idx) => ({
            correlation_id: c.correlation_id || `check-${idx + 1}`,
            tuple_key: {
              user: c.user,
              relation: c.relation,
              object: c.object
            }
          }))
        };
      }

      currentPreviewRequest = { endpoint, pdpRoute, payload };

      const reqBadge = document.getElementById("reqBadge");
      if (reqBadge) reqBadge.textContent = `POST ${endpoint}`;

      const reqPdpBadge = document.getElementById("reqPdpBadge");
      if (reqPdpBadge) reqPdpBadge.textContent = `OpenFGA: POST ${pdpRoute}`;

      const reqModeBadge = document.getElementById("reqModeBadge");
      const isExecuted = lastExecutedRequest &&
        lastExecutedRequest.endpoint === endpoint &&
        JSON.stringify(lastExecutedRequest.payload) === JSON.stringify(payload);

      if (reqModeBadge) {
        if (isExecuted) {
          reqModeBadge.className = "badge-preview-sent";
          reqModeBadge.innerHTML = "📤 Запрос отправлен (Актуален)";
        } else {
          reqModeBadge.className = "badge-preview-live";
          reqModeBadge.innerHTML = "⚡ Предпросмотр (Live Preview)";
        }
      }

      const jsonReq = document.getElementById("jsonRequest");
      if (jsonReq) {
        jsonReq.textContent = JSON.stringify(payload, null, 2);
      }

      // Если параметры изменились относительно последнего выполненного запроса
      if (!isExecuted && lastExecutedResponse) {
        const resBadge = document.getElementById("resBadge");
        if (resBadge) {
          resBadge.className = "badge-status badge-status-idle";
          resBadge.textContent = "⏳ Изменены параметры (ожидание проверки)";
        }
        const resDuration = document.getElementById("resDuration");
        if (resDuration) resDuration.textContent = "";
      }
    }

    function setSubjectMode(mode) { return;
      currentSubjectMode = mode;
      const btnDirect = document.getElementById("btnSubjectModeDirect");
      const btnFirst = document.getElementById("btnSubjectModeFirst");
      const btnChain = document.getElementById("btnSubjectModeChain");
      const badge = document.getElementById("subjectModeBadge");

      [btnDirect, btnFirst, btnChain].forEach(b => b && b.classList.remove("active"));
      if (mode === "direct") {
        if (btnDirect) btnDirect.classList.add("active");
        if (badge) { badge.textContent = "Режим: Личные права (direct)"; badge.style.background = "#f1f5f9"; badge.style.color = "#475569"; }
      } else if (mode === "first") {
        if (btnFirst) btnFirst.classList.add("active");
        if (badge) { badge.textContent = "Режим: 1-е замещение (direct)"; badge.style.background = "#fef3c7"; badge.style.color = "#b45309"; }
      } else {
        if (btnChain) btnChain.classList.add("active");
        if (badge) { badge.textContent = "Режим: Вся цепочка (chain)"; badge.style.background = "#e0f2fe"; badge.style.color = "#0369a1"; }
      }

      syncRecommendedRelation();
    }

    function syncRecommendedRelation() {
      const targetType = document.getElementById("checkTargetType")?.value;
      const relationSel = document.getElementById("checkRelation");
      if (!relationSel) return;

      let preferredRel = "can_use";
      if (currentSubjectMode === "direct") {
        if (targetType === "Roles") preferredRel = "direct_assignee";
        else if (targetType === "Divisions" || targetType === "Staffs" || targetType === "Professions") preferredRel = "direct_employee";
        else preferredRel = "direct_replaces";
      } else if (currentSubjectMode === "first") {
        preferredRel = "can_use_direct";
      } else {
        const options = Array.from(relationSel.options).map(o => o.value);
        if (options.includes("can_use_chain")) preferredRel = "can_use_chain";
        else preferredRel = "can_use";
      }

      const hasOption = Array.from(relationSel.options).some(o => o.value === preferredRel);
      if (hasOption) {
        relationSel.value = preferredRel;
      }
    }

    function formatEmployeeOptionLabel(emp, tbls) {
      if (!emp) return "";
      const repList = (tbls?.replacings || tables?.replacings || []);
      const u = emp.username;

      // Трассировка цепочки замещений, кого замещает этот сотрудник
      const repChain = [];
      let curr = u;
      const seen = new Set([curr]);
      while (curr) {
        const rep = repList.find(r => r.replacing_username === curr);
        if (rep && rep.replaced_username && !seen.has(rep.replaced_username)) {
          repChain.push(rep.replaced_username);
          seen.add(rep.replaced_username);
          curr = rep.replaced_username;
        } else {
          break;
        }
      }

      // Кто замещает этого сотрудника
      const subs = repList.filter(r => r.replaced_username === u).map(r => r.replacing_username);

      let badge = "";
      if (repChain.length > 0 && subs.length > 0) {
        badge = ` [🔄 зам.: ${repChain.join(" ➔ ")} | 👥 его зам.: ${subs.join(", ")}]`;
      } else if (repChain.length > 0) {
        if (repChain.length > 1) {
          badge = ` [🔄 цепочка замещений: ${repChain.join(" ➔ ")}]`;
        } else {
          badge = ` [🔄 замещает: ${repChain[0]}]`;
        }
      } else if (subs.length > 0) {
        badge = ` [👥 его замещают: ${subs.join(", ")}]`;
      }

      return `${emp.username} — ${emp.full_name}${badge}`;
    }

    function getPossibleUserTypesForRelation(targetType, relationName, visited = new Set()) {
      const key = `${targetType}#${relationName}`;
      if (visited.has(key)) return new Set();
      visited.add(key);

      if (!modelJson || !modelJson.type_definitions) return new Set();

      const typeDef = modelJson.type_definitions.find(t => t.type === targetType);
      if (!typeDef || !typeDef.relations || !typeDef.relations[relationName]) return new Set();

      const relDef = typeDef.relations[relationName];
      const metaDef = typeDef.metadata && typeDef.metadata.relations && typeDef.metadata.relations[relationName];
      const result = new Set();

      function evaluateExpr(expr) {
        if (!expr) return;
        if (expr.this) {
          if (metaDef && metaDef.directly_related_user_types) {
            metaDef.directly_related_user_types.forEach(u => {
              if (u.type) {
                if (u.relation) {
                  const subTypes = getPossibleUserTypesForRelation(u.type, u.relation, new Set(visited));
                  subTypes.forEach(t => result.add(t));
                } else {
                  result.add(u.type);
                }
              }
            });
          }
        } else if (expr.computedUserset) {
          const subTypes = getPossibleUserTypesForRelation(targetType, expr.computedUserset.relation, new Set(visited));
          subTypes.forEach(t => result.add(t));
        } else if (expr.tupleToUserset) {
          const tuplesetRel = expr.tupleToUserset.tupleset.relation;
          const computedRel = expr.tupleToUserset.computedUserset.relation;
          const tupleTypes = getPossibleUserTypesForRelation(targetType, tuplesetRel, new Set(visited));
          tupleTypes.forEach(t => {
            const subTypes = getPossibleUserTypesForRelation(t, computedRel, new Set(visited));
            subTypes.forEach(st => result.add(st));
          });
        } else if (expr.union && expr.union.child) {
          expr.union.child.forEach(evaluateExpr);
        } else if (expr.intersection && expr.intersection.child) {
          expr.intersection.child.forEach(evaluateExpr);
        } else if (expr.difference && expr.difference.base) {
          evaluateExpr(expr.difference.base);
        }
      }

      evaluateExpr(relDef);
      return result;
    }

    function getCheckRelations(subjectType, targetType) {
      if (!modelJson || !modelJson.type_definitions) {
        return (CHECK_RELATIONS[targetType] || []).map(r => ({ value: r.value, label: r.label }));
      }

      const typeDef = modelJson.type_definitions.find(t => t.type === targetType);
      if (!typeDef || !typeDef.relations) {
        return [];
      }

      const relKeys = Object.keys(typeDef.relations);
      const items = [];

      relKeys.forEach(rel => {
        // Проверяем допустимость маршрута: может ли subjectType обладать отношением rel к targetType
        const possibleUserTypes = getPossibleUserTypesForRelation(targetType, rel);
        if (subjectType && possibleUserTypes.size > 0 && !possibleUserTypes.has(subjectType)) {
          return; // Недопустимый маршрут — исключаем из выпадающего списка
        }

        let label = rel;
        if (rel === "can_use") label = `can_use (🎯 Рекомендуется — Целевое право OpenFGA)`;
        else if (rel === "can_use_chain") label = `can_use_chain (🔗 Целевое право: вся цепочка замещений)`;
        else if (rel === "can_use_direct") label = `can_use_direct (🎯 Целевое право: только 1-й уровень замещения)`;
        else if (rel === "direct_assignee") label = `direct_assignee (👤 Личное прямое назначение роли)`;
        else if (rel === "direct_employee") label = `direct_employee (👤 Прямое личное прикрепление)`;
        else if (rel === "substitute_direct_assignee") label = `substitute_direct_assignee (🔄 Роль по 1-му замещению)`;
        else if (rel === "substitute_chain_assignee") label = `substitute_chain_assignee (🔄 Роль по цепочке замещений)`;
        else if (rel === "substitute_assignee") label = `substitute_assignee (🔄 Роль по замещению)`;
        else if (rel === "substitute_direct_employee") label = `substitute_direct_employee (🔄 Отдел по 1-му замещению)`;
        else if (rel === "substitute_chain_employee") label = `substitute_chain_employee (🔄 Отдел по цепочке замещений)`;
        else if (rel === "substitute_employee") label = `substitute_employee (🔄 Сотрудник по замещению в отделе)`;
        else if (rel === "substitute_direct_from_employee") label = `substitute_direct_from_employee (🔄 Штатка по 1-му замещению)`;
        else if (rel === "substitute_chain_from_employee") label = `substitute_chain_from_employee (🔄 Штатка по цепочке замещений)`;
        else if (rel === "substitute_from_employee") label = `substitute_from_employee (🔄 Штатка через замещаемого)`;
        else if (rel === "staff_assignee") label = `staff_assignee (📋 Назначение роли на штатную позицию)`;
        else if (rel === "division_assignee") label = `division_assignee (🏢 Назначение роли на подразделение)`;
        else if (rel === "staff_employee") label = `staff_employee (Сотрудники через штатное расписание)`;
        else if (rel === "division_employee") label = `division_employee (Сотрудники через подразделение)`;
        else if (rel === "assignee_direct") label = `assignee_direct (Все источники: прямое + 1-й ур. замещения + штатка/отдел)`;
        else if (rel === "assignee_chain") label = `assignee_chain (Все источники: прямое + вся цепочка + штатка/отдел)`;
        else if (rel === "assignee") label = `assignee (Все источники прав роли)`;
        else if (rel === "employee_direct") label = `employee_direct (Все источники: прямое + 1-й ур. замещения + подотделы)`;
        else if (rel === "employee_chain") label = `employee_chain (Все источники: прямое + вся цепочка + подотделы)`;
        else if (rel === "employee") label = `employee (Все сотрудники подразделения)`;
        else if (rel === "child") label = `child (🏢 Прямые дочерние подотделы)`;
        else if (rel === "descendant") label = `descendant (🏢 Все подчиненные отделы вниз по дереву)`;
        else if (rel === "parent") label = `parent (🏢 Прямой родительский отдел)`;
        else if (rel === "ancestor") label = `ancestor (🏢 Все вышестоящие отделы вверх по дереву)`;
        else if (rel === "direct_staff") label = `direct_staff (Штатки непосредственно в отделе)`;
        else if (rel === "staff") label = `staff (Штатные единицы)`;
        else if (rel === "staff_employee") label = `staff_employee (Сотрудники через штатку)`;
        else if (rel === "staff_employee_direct") label = `staff_employee_direct (Сотрудники по штатке напрямую)`;
        else if (rel === "direct_division") label = `direct_division (Прямое подразделение)`;
        else if (rel === "division") label = `division (Подразделение и предки)`;
        else if (rel === "all_divisions") label = `all_divisions (Все подразделения сотрудника)`;
        else if (rel === "all_divisions_chain") label = `all_divisions_chain (🏢 Все отделы: свои + вся цепочка замещений)`;
        else if (rel === "all_divisions_direct") label = `all_divisions_direct (🏢 Все отделы: свои + 1-й уровень замещения)`;
        else if (rel === "ancestor_division") label = `ancestor_division (Вышестоящие отделы)`;
        else if (rel === "descendant_division") label = `descendant_division (Подчиненные отделы)`;
        else if (rel === "descendant_division_from_replaced") label = `descendant_division_from_replaced (Подчиненные отделы замещаемого)`;
        else if (rel === "division_from_replaced") label = `division_from_replaced (Отдел замещаемого)`;
        else if (rel === "direct_profession") label = `direct_profession (Личная профессия)`;
        else if (rel === "profession") label = `profession (Профессия должности)`;
        else if (rel === "profession_from_replaced") label = `profession_from_replaced (Профессия замещаемого)`;
        else if (rel === "staff_chain") label = `staff_chain (Штатки по всей цепочке замещений)`;
        else if (rel === "staff_direct") label = `staff_direct (Штатки по 1-му уровню замещения)`;
        else if (rel === "staff_from_replaced") label = `staff_from_replaced (Штатка замещаемого)`;
        else if (rel === "direct_role") label = `direct_role (Личные роли сотрудника)`;
        else if (rel === "role_chain") label = `role_chain (Все роли по всей цепочке замещений)`;
        else if (rel === "role_direct") label = `role_direct (Все роли по 1-му уровню замещения)`;
        else if (rel === "role_from_replaced") label = `role_from_replaced (Роли замещаемого)`;
        else if (rel === "direct_replaces") label = `direct_replaces (Запись замещения сотрудника)`;
        else if (rel === "replaces_direct") label = `replaces_direct (Кого замещает лично)`;
        else if (rel === "replaces_chain") label = `replaces_chain (Вся цепочка замещаемых)`;
        else if (rel === "replaces") label = `replaces (Кого замещает)`;
        else if (rel === "direct_substitute") label = `direct_substitute (Прямой замещающий сотрудник)`;
        else if (rel === "substitute_direct") label = `substitute_direct (Прямые замещающие)`;
        else if (rel === "substitute_chain") label = `substitute_chain (Все замещающие по всей цепочке)`;
        else if (rel === "substitute") label = `substitute (Кто замещает)`;
        else if (rel === "role") label = `role (Целевая роль)`;
        else label = `${rel} (Отношение модели model.json)`;

        items.push({ value: rel, label });
      });

      const priorityOrder = {
        can_use: 1, can_use_chain: 2, can_use_direct: 3,
        direct_assignee: 4, direct_employee: 4,
        substitute_chain_assignee: 5, substitute_direct_assignee: 6,
        substitute_chain_employee: 5, substitute_direct_employee: 6,
        assignee_chain: 7, assignee_direct: 8, assignee: 9,
        employee_chain: 7, employee_direct: 8, employee: 9
      };

      items.sort((a, b) => {
        const pA = priorityOrder[a.value] || 50;
        const pB = priorityOrder[b.value] || 50;
        if (pA !== pB) return pA - pB;
        return a.value.localeCompare(b.value);
      });

      return items;
    }

    function getCheckRelationsForTargetType(targetType) {
      const subjectType = document.getElementById("checkSubjectType")?.value;
      return getCheckRelations(subjectType, targetType);
    }

    function updateCheckRelations() {
      const subjectType = document.getElementById("checkSubjectType")?.value;
      const targetType = document.getElementById("checkTargetType")?.value;
      const relationSel = document.getElementById("checkRelation");
      const btnCheck = document.getElementById("btnCheckSubmit") || document.querySelector("button[onclick='executeCheckFromForm()']");
      if (!relationSel || !subjectType || !targetType) return;

      const relations = getCheckRelations(subjectType, targetType);
      relationSel.innerHTML = "";

      if (relations.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = `⛔ Нет допустимых маршрутов в модели (${subjectType} ➔ ${targetType})`;
        relationSel.appendChild(opt);
        relationSel.disabled = true;
        if (btnCheck) {
          btnCheck.disabled = true;
          btnCheck.style.opacity = "0.5";
          btnCheck.style.cursor = "not-allowed";
          btnCheck.title = `В модели OpenFGA нет допустимых маршрутов для связи ${subjectType} ➔ ${targetType}`;
        }
      } else {
        relationSel.disabled = false;
        if (btnCheck) {
          btnCheck.disabled = false;
          btnCheck.style.opacity = "1";
          btnCheck.style.cursor = "pointer";
          btnCheck.title = "";
        }
        relations.forEach(r => {
          const opt = document.createElement("option");
          opt.value = r.value;
          opt.textContent = r.label;
          relationSel.appendChild(opt);
        });
        syncRecommendedRelation();
      }
      updateLiveRequestPreview();
    }

    function getLookupDependenciesFromModel(type, selectedEntityVal) {
      const REL_LOOKUP_MAP = {
        Employees: [
          // 1. Подразделения (Divisions)
          { relation: "all_divisions_chain", method: "list-users", targetType: "Divisions", label: "🏢 Все отделы: свои + вся цепочка замещений до конца (all_divisions_chain)" },
          { relation: "all_divisions_direct", method: "list-users", targetType: "Divisions", label: "🏢 Все отделы: свои + 1-й уровень замещения (all_divisions_direct)" },
          { relation: "direct_division", method: "list-users", targetType: "Divisions", label: "Прямое подразделение сотрудника (строго 1 отдел: direct_division)" },
          { relation: "division", method: "list-users", targetType: "Divisions", label: "Все подразделения сотрудника вверх по дереву (division)" },
          { relation: "division_from_replaced", method: "list-users", targetType: "Divisions", label: "Головной отдел замещаемого сотрудника (division_from_replaced)", requireReplaced: true },
          { relation: "descendant_division_from_replaced", method: "list-users", targetType: "Divisions", label: "Подчиненные отделы замещаемого сотрудника вниз (descendant_division_from_replaced)", requireReplaced: true },

          // 2. Профессии (Professions)
          { relation: "direct_profession", method: "list-users", targetType: "Professions", label: "🎓 Прямая профессия сотрудника (direct_profession)" },
          { relation: "profession", method: "list-users", targetType: "Professions", label: "🎓 Все профессии (прямая + через замещаемого: profession)" },
          { relation: "profession_from_replaced", method: "list-users", targetType: "Professions", label: "🎓 Профессия замещаемого сотрудника (profession_from_replaced)", requireReplaced: true },

          // 3. Штатные единицы (Staffs)
          { relation: "staff_chain", method: "list-users", targetType: "Staffs", label: "📋 Штатные единицы: своя + вся цепочка замещений до конца (staff_chain)" },
          { relation: "staff_direct", method: "list-users", targetType: "Staffs", label: "📋 Штатные единицы: своя + 1-й уровень замещения (staff_direct)" },
          { relation: "direct_staff", method: "list-users", targetType: "Staffs", label: "Личная штатная единица напрямую (direct_staff)" },
          { relation: "staff_from_replaced", method: "list-users", targetType: "Staffs", label: "Штатная единица замещаемого сотрудника (staff_from_replaced)", requireReplaced: true },

          // 4. Замещения (Replacings)
          { relation: "replaces_direct", method: "list-users", targetType: "Employees", label: "🔄 Кого замещает: только 1-й уровень (замещаемый сотрудник: replaces_direct)", requireReplaced: true },
          { relation: "replaces_chain", method: "list-users", targetType: "Employees", label: "🔄 Кого замещает: вся цепочка замещений до последнего (replaces_chain)", requireReplaced: true },
          { relation: "substitute_direct", method: "list-users", targetType: "Employees", label: "👥 Кто замещает сотрудника: только 1-й уровень (substitute_direct)", requireSubstitutes: true },
          { relation: "substitute_chain", method: "list-users", targetType: "Employees", label: "👥 Кто замещает сотрудника: вся цепочка замещений (substitute_chain)", requireSubstitutes: true },
          { relation: "direct_replaces", method: "list-users", targetType: "Employees", label: "Прямая запись замещения сотрудника (direct_replaces)", requireReplaced: true },
          { relation: "direct_substitute", method: "list-users", targetType: "Employees", label: "Прямой замещающий сотрудник (direct_substitute)", requireSubstitutes: true },

          // 5. Роли (Roles - опущены вниз)
          { relation: "role_chain", method: "list-users", targetType: "Roles", label: "🔑 Все роли сотрудника: с учетом цепочки замещений до конца (role_chain)" },
          { relation: "role_direct", method: "list-users", targetType: "Roles", label: "🔑 Все роли сотрудника: с учетом 1-го уровня замещения (role_direct)" },
          { relation: "direct_role", method: "list-users", targetType: "Roles", label: "Личные роли сотрудника напрямую без замещений (direct_role)" },
          { relation: "role_from_replaced", method: "list-users", targetType: "Roles", label: "Роли замещаемого сотрудника (role_from_replaced)", requireReplaced: true }
        ],
        Divisions: [
          { relation: "direct_employee", method: "list-users", targetType: "Employees", label: "👤 Прямые сотрудники отдела (только этот отдел: direct_employee)" },
          { relation: "substitute_direct_employee", method: "list-users", targetType: "Employees", label: "🔄 Замещающие сотрудников отдела: 1-й уровень (substitute_direct_employee)" },
          { relation: "substitute_chain_employee", method: "list-users", targetType: "Employees", label: "🔄 Замещающие сотрудников отдела: вся цепочка (substitute_chain_employee)" },
          { relation: "employee_direct", method: "list-users", targetType: "Employees", label: "Все сотрудники отдела: с 1-м замещением и подотделами (employee_direct)" },
          { relation: "employee_chain", method: "list-users", targetType: "Employees", label: "Все сотрудники отдела: с цепочкой замещений и подотделами (employee_chain)" },
          { relation: "employee", method: "list-users", targetType: "Employees", label: "Все сотрудники подразделения (employee)" },
          { relation: "child", method: "list-users", targetType: "Divisions", label: "🏢 Прямые дочерние подотделы (child)" },
          { relation: "descendant", method: "list-users", targetType: "Divisions", label: "🏢 Все подчиненные отделы вниз по дереву (descendant)" },
          { relation: "parent", method: "list-users", targetType: "Divisions", label: "🏢 Прямой вышестоящий отдел (parent)" },
          { relation: "ancestor", method: "list-users", targetType: "Divisions", label: "🏢 Все вышестоящие отделы вверх по дереву (ancestor)" },
          { relation: "direct_staff", method: "list-users", targetType: "Staffs", label: "Штатные единицы непосредственно в отделе (direct_staff)" },
          { relation: "staff", method: "list-users", targetType: "Staffs", label: "Штатные единицы отдела и дочерних подотделов (staff)" }
        ],
        Roles: [
          { relation: "direct_assignee", method: "list-users", targetType: "Employees", label: "👤 Прямые назначения роли лично сотрудникам (direct_assignee)" },
          { relation: "substitute_direct_assignee", method: "list-users", targetType: "Employees", label: "🔄 Назначения роли по 1-му уровню замещения (substitute_direct_assignee)" },
          { relation: "substitute_chain_assignee", method: "list-users", targetType: "Employees", label: "🔄 Назначения роли по цепочке замещений до конца (substitute_chain_assignee)" },
          { relation: "staff_assignee", method: "list-users", targetType: "Staffs", label: "📋 Штатные единицы, на которые назначена роль (staff_assignee)" },
          { relation: "division_assignee", method: "list-users", targetType: "Divisions", label: "🏢 Подразделения, на которые назначена роль (division_assignee)" },
          { relation: "assignee_direct", method: "list-users", targetType: "Employees", label: "Все обладатели роли: 1-й уровень замещения + прямые (assignee_direct)" },
          { relation: "assignee_chain", method: "list-users", targetType: "Employees", label: "Все обладатели роли: вся цепочка замещений + прямые (assignee_chain)" },
          { relation: "assignee", method: "list-users", targetType: "Employees", label: "Все сотрудники с данной ролью из всех источников (assignee)" }
        ],
        Staffs: [
          { relation: "direct_employee", method: "list-users", targetType: "Employees", label: "👤 Личный сотрудник на штатной позиции (direct_employee)" },
          { relation: "substitute_direct_from_employee", method: "list-users", targetType: "Employees", label: "🔄 Замещающий на штатке: 1-й уровень (substitute_direct_from_employee)" },
          { relation: "substitute_chain_from_employee", method: "list-users", targetType: "Employees", label: "🔄 Замещающий на штатке: вся цепочка (substitute_chain_from_employee)" },
          { relation: "employee_direct", method: "list-users", targetType: "Employees", label: "Исполнители штатки: прямой + 1-е замещение (employee_direct)" },
          { relation: "employee_chain", method: "list-users", targetType: "Employees", label: "Исполнители штатки: прямой + вся цепочка + грант (employee_chain)" },
          { relation: "employee", method: "list-users", targetType: "Employees", label: "Все исполнители штатной единицы (employee)" },
          { relation: "direct_division", method: "list-users", targetType: "Divisions", label: "🏢 Прямое подразделение штатки (direct_division)" },
          { relation: "division", method: "list-users", targetType: "Divisions", label: "🏢 Подразделение и вышестоящие отделы (division)" },
          { relation: "profession", method: "list-users", targetType: "Professions", label: "💼 Профессия штатной единицы (profession)" }
        ],
        Professions: [
          { relation: "direct_employee", method: "list-users", targetType: "Employees", label: "👤 Прямые сотрудники с данной профессией (direct_employee)" },
          { relation: "staff_employee_direct", method: "list-users", targetType: "Employees", label: "Сотрудники по штатке: 1-й уровень замещения (staff_employee_direct)" },
          { relation: "staff_employee", method: "list-users", targetType: "Employees", label: "Сотрудники по штатке: вся цепочка замещений (staff_employee)" },
          { relation: "employee_direct", method: "list-users", targetType: "Employees", label: "Все сотрудники профессии: 1-й уровень замещения (employee_direct)" },
          { relation: "employee_chain", method: "list-users", targetType: "Employees", label: "Все сотрудники профессии: вся цепочка замещений (employee_chain)" },
          { relation: "employee", method: "list-users", targetType: "Employees", label: "Все сотрудники с данной профессией (employee)" },
          { relation: "staff", method: "list-users", targetType: "Staffs", label: "📋 Штатные единицы с данной профессией (staff)" }
        ]
      };

      let baseList = REL_LOOKUP_MAP[type] ? [...REL_LOOKUP_MAP[type]] : [];

      // Динамическая фильтрация для конкретного сотрудника: скрываем маршруты замещений, если замещений нет
      if (type === "Employees" && selectedEntityVal && tables && tables.replacings) {
        const username = selectedEntityVal.replace("Employees:", "");
        const hasReplaced = (tables.replacings || []).some(r => r.replacing_username === username);
        const hasSubstitutes = (tables.replacings || []).some(r => r.replaced_username === username);

        baseList = baseList.filter(item => {
          if (item.requireReplaced && !hasReplaced) return false;
          if (item.requireSubstitutes && !hasSubstitutes) return false;
          return true;
        });
      }

      return baseList;
    }

    let API_BASE = "";

    async function safeFetchJson(endpoint, options = {}) {
      const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;
      let res;
      try {
        res = await fetch(url, options);
      } catch (networkErr) {
        throw new Error(`Не удалось связаться с сервером (${url}). Убедитесь, что запущен 'npm run dev'!`);
      }

      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        throw new Error(`Сервер вернул не JSON (HTTP ${res.status}): "${text.slice(0, 100)}...". Откройте страницу через порт запущенного сервера (http://localhost:3000 или http://localhost:8000)!`);
      }

      if (!res.ok) {
        const errMsg = data?.error || `HTTP ${res.status}: ${res.statusText}`;
        throw new Error(errMsg);
      }

      return { data, status: res.status };
    }

    async function initApiBase() {
      const candidates = [
        "", // текущий хост
        "http://localhost:3000",
        "http://localhost:8000"
      ];
      for (const base of candidates) {
        try {
          const res = await fetch(`${base}/data`);
          if (res.ok) {
            const json = await res.json();
            if (json && json.employees) {
              API_BASE = base;
              tables = json;
              return true;
            }
          }
        } catch (e) {}
      }
      return false;
    }

    const CHECK_RELATIONS = {
      Roles: [
        { value: "can_use", label: "can_use (Рекомендуется — Целевое право использования)" },
        { value: "assignee", label: "assignee (Все источники: прямое + замещение + штатка/отдел)" },
        { value: "direct_assignee", label: "direct_assignee (Строго прямое назначение роли)" },
        { value: "substitute_assignee", label: "substitute_assignee (Строго по замещению)" }
      ],
      Divisions: [
        { value: "can_use", label: "can_use (Рекомендуется — Целевое право в подразделении)" },
        { value: "employee", label: "employee (Все источники: прямой + подотделы + замещение)" },
        { value: "direct_employee", label: "direct_employee (Строго прямое прикрепление к отделу)" },
        { value: "substitute_employee", label: "substitute_employee (Сотрудник по замещению в отделе)" }
      ],
      Professions: [
        { value: "can_use", label: "can_use (Рекомендуется — Целевое право по профессии)" },
        { value: "employee", label: "employee (Все источники: прямая + штатка + грант)" },
        { value: "direct_employee", label: "direct_employee (Строго прямое назначение профессии)" }
      ],
      Staffs: [
        { value: "can_use", label: "can_use (Рекомендуется — Целевое право занятия штатки)" },
        { value: "employee", label: "employee (Исполнитель штатной единицы)" }
      ]
    };

    function togglePresets(forceOpen) {
      const content = document.getElementById("presetsContent");
      const btn = document.getElementById("btnTogglePresets");
      if (!content || !btn) return;
      const isHidden = content.style.display === "none";
      const shouldOpen = forceOpen !== undefined ? forceOpen : isHidden;
      if (shouldOpen) {
        content.style.display = "block";
        btn.textContent = "Скрыть пресеты ▲";
      } else {
        content.style.display = "none";
        btn.textContent = "Показать пресеты ▼";
      }
    }

    function switchTab(tab) {
      currentActiveTab = tab;
      const tabs = ["check", "lookup", "batch"];
      tabs.forEach(t => {
        const btn = document.getElementById(`tabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
        const content = document.getElementById(`tabContent${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (btn) btn.classList.toggle("active", t === tab);
        if (content) content.classList.toggle("active", t === tab);
      });

      if (tab === "batch") renderBatchTable();
      updateLiveRequestPreview();
    }

    async function loadData() {
      try {
        const injected = window.__TABLES_DATA__;
        if (injected && typeof injected === "object") tables = injected;
      } catch (e) {}

      try {
        const injectedModel = window.__MODEL_DATA__;
        if (injectedModel && typeof injectedModel === "object") modelJson = injectedModel;
      } catch (e) {}

      try {
        const injectedFga = window.__MODEL_FGA__;
        if (injectedFga && typeof injectedFga === "string") modelFga = injectedFga;
      } catch (e) {}

      if (!tables || !tables.employees) {
        await initApiBase();
      }

      if (!modelJson) {
        try {
          const res = await fetch(`${API_BASE}/model`);
          if (res.ok) modelJson = await res.json();
        } catch (e) {}
      }

      if (!modelFga) {
        try {
          const res = await fetch(`${API_BASE}/model.fga`);
          if (res.ok) modelFga = await res.text();
        } catch (e) {}
      }

      // Инициализация модуля проверки прав (Check)
      onCheckSubjectTypeChange();
      onCheckTargetTypeChange();

      // Инициализация модуля поиска зависимостей (Lookup)
      onLookupEntityTypeChange();

      // Инициализация модуля пакетной проверки (Batch Check)
      initBatchDropdowns();
      renderBatchTable();

      // Таблицы
      renderCurrentTable();

      // Инициализация просмотрщика JSON модели
      renderJsonModelView();

      // Инициализация интерактивного графа модели
      drawGraph();

      // Первичная инициализация предпросмотра API-запроса (Live Preview)
      updateLiveRequestPreview();
    }

    function onCheckSubjectTypeChange() {
      const type = document.getElementById("checkSubjectType")?.value;
      const sel = document.getElementById("checkSubjectItem");
      if (!type || !sel) return;
      populateEntitySelect(sel, type);
      updateCheckRelations();
      updateLiveRequestPreview();
    }

    function onCheckTargetTypeChange() {
      const targetType = document.getElementById("checkTargetType")?.value;
      const targetItemSel = document.getElementById("checkTargetItem");
      if (!targetType || !targetItemSel) return;

      populateEntitySelect(targetItemSel, targetType);
      updateCheckRelations();
    }

    function onToggleContextualTuples(event) {
      const chk = document.getElementById("enableContextualTuples");
      const isChecked = event ? event.target.checked : (chk ? chk.checked : false);
      const panel = document.getElementById("contextualTuplesPanel");
      const badge = document.getElementById("contextualTuplesBadge");
      const txt = document.getElementById("contextualTuplesJson");
      if (panel) panel.style.display = isChecked ? "block" : "none";
      if (isChecked && txt && !txt.value.trim()) {
        txt.value = JSON.stringify(CONTEXTUAL_PRESETS.sub_68176, null, 2);
      }
      onContextualTuplesInput();
    }

    function onContextualTuplesInput() {
      const isChecked = document.getElementById("enableContextualTuples")?.checked;
      const badge = document.getElementById("contextualTuplesBadge");
      const raw = document.getElementById("contextualTuplesJson")?.value?.trim();
      if (!isChecked) {
        if (badge) {
          badge.textContent = "Неактивен";
          badge.style.background = "#f1f5f9";
          badge.style.color = "#64748b";
        }
      } else if (!raw) {
        if (badge) {
          badge.textContent = "Пустой контекст";
          badge.style.background = "#fef3c7";
          badge.style.color = "#b45309";
        }
      } else {
        try {
          const parsed = JSON.parse(raw);
          const count = Array.isArray(parsed) ? parsed.length : 1;
          if (badge) {
            badge.textContent = `Активен (${count} кортеж${count === 1 ? "" : (count < 5 ? "а" : "ей")})`;
            badge.style.background = "#e2e8f0";
            badge.style.color = "#0f172a";
          }
        } catch (e) {
          if (badge) {
            badge.textContent = "Ошибка JSON";
            badge.style.background = "#fee2e2";
            badge.style.color = "#b91c1c";
          }
        }
      }
      updateLiveRequestPreview();
    }

    const CONTEXTUAL_PRESETS = {
      sub_68176: [
        { user: "Employees:34491", relation: "direct_substitute", object: "Employees:68176" },
        { user: "Employees:68176", relation: "direct_replaces", object: "Employees:34491" }
      ],
      grant_role: [
        { user: "Employees:34491", relation: "direct_assignee", object: "Roles:c66452e0-23c5-5cbf-97fa-07b1480465dc" }
      ]
    };

    function applyContextualPreset(key) {
      const chk = document.getElementById("enableContextualTuples");
      const txt = document.getElementById("contextualTuplesJson");
      if (!chk || !txt) return;

      if (key === "clear") {
        txt.value = "";
        chk.checked = false;
      } else if (CONTEXTUAL_PRESETS[key]) {
        txt.value = JSON.stringify(CONTEXTUAL_PRESETS[key], null, 2);
        chk.checked = true;
      }
      onToggleContextualTuples();
    }

    async function runPresetContextualSubstitute(user, relation, object, replacedUser) {
      switchTab("check");
      syncCheckForm(user, relation, object);
      
      const repIng = String(user).replace("Employees:", "");
      const repEd = String(replacedUser).replace("Employees:", "");
      const tuples = [
        { user: `Employees:${repIng}`, relation: "direct_substitute", object: `Employees:${repEd}` },
        { user: `Employees:${repEd}`, relation: "direct_replaces", object: `Employees:${repIng}` }
      ];

      const chk = document.getElementById("enableContextualTuples");
      const txt = document.getElementById("contextualTuplesJson");
      if (chk) chk.checked = true;
      if (txt) txt.value = JSON.stringify(tuples, null, 2);
      onToggleContextualTuples();

      const title = `Временное замещение на лету: ${user} замещает ${replacedUser} -> доступ к ${object}`;
      await runCheckInternal(user, relation, object, title, tuples);
    }

    async function executeCheckFromForm() {
      const user = document.getElementById("checkSubjectItem")?.value;
      const object = document.getElementById("checkTargetItem")?.value;
      const relation = document.getElementById("checkRelation")?.value;

      if (!user || !object || !relation) {
        showError("Невозможно выполнить проверку: не выбрано допустимое отношение или маршрут недопустим в модели.");
        return;
      }

      let contextualTuples = null;
      const ctxEnabled = document.getElementById("enableContextualTuples")?.checked;
      if (ctxEnabled) {
        const rawCtx = document.getElementById("contextualTuplesJson")?.value?.trim();
        if (rawCtx) {
          try {
            const parsed = JSON.parse(rawCtx);
            if (Array.isArray(parsed) && parsed.length > 0) {
              contextualTuples = parsed;
            }
          } catch (e) {
            showError("Ошибка в формате Contextual Tuples (ожидается JSON-массив кортежей): " + e.message);
            return;
          }
        }
      }

      const title = `Проверка права: ${user} —[ ${relation} ]—> ${object}`;
      await runCheckInternal(user, relation, object, title, contextualTuples);
    }

    function updateLookupDependenciesDropdown() {
      const type = document.getElementById("lookupEntityType")?.value;
      const entityVal = document.getElementById("lookupEntityItem")?.value;
      const relSel = document.getElementById("lookupDependencyRel");
      if (!relSel || !type) return;

      const prevSelectedRel = lookupCurrentDependencies && lookupCurrentDependencies[parseInt(relSel.value, 10)]?.relation;

      const dependencies = getLookupDependenciesFromModel(type, entityVal);
      lookupCurrentDependencies = dependencies;
      relSel.innerHTML = "";

      let selectedIndex = 0;
      dependencies.forEach((d, idx) => {
        const opt = document.createElement("option");
        opt.value = idx;
        opt.textContent = d.label;
        if (d.relation === prevSelectedRel) {
          selectedIndex = idx;
        }
        relSel.appendChild(opt);
      });

      if (dependencies.length > 0) {
        relSel.selectedIndex = selectedIndex;
      }
    }

    function onLookupEntityTypeChange() {
      const type = document.getElementById("lookupEntityType").value;
      const itemSel = document.getElementById("lookupEntityItem");

      itemSel.innerHTML = "";

      let list = [];
      if (type === "Employees") {
        list = (tables.employees || []).map(e => ({ val: `Employees:${e.username}`, text: formatEmployeeOptionLabel(e, tables) }));
      } else if (type === "Divisions") {
        list = (tables.divisions || []).map(d => ({
          val: `Divisions:${d.id}`,
          text: `${d.id} — ${d.name}${d.full_code ? ` [путь: ${d.full_code}]` : ""}`
        }));
      } else if (type === "Roles") {
        list = (tables.roles || []).map(r => ({ val: `Roles:${r.id}`, text: `${r.role_name} (${r.id.slice(0, 8)}...)` }));
      } else if (type === "Professions") {
        list = (tables.professions || []).map(p => ({ val: `Professions:${p.code}`, text: `${p.code} — ${p.name}` }));
      } else if (type === "Staffs") {
        list = (tables.staffs || []).map(s => ({ val: `Staffs:${s.id}`, text: `Штатка ${s.id} (отдел ${s.division_id})` }));
      }

      list.forEach(item => {
        const opt = document.createElement("option");
        opt.value = item.val;
        opt.textContent = item.text;
        itemSel.appendChild(opt);
      });

      if (type === "Employees") {
        itemSel.value = "Employees:34491";
      }

      updateLookupDependenciesDropdown();
      onLookupEntityItemChange();
    }

    function onLookupEntityItemChange() {
      // Динамически обновляем доступные зависимости для конкретной сущности
      updateLookupDependenciesDropdown();
      updateLiveRequestPreview();
    }

    async function executeLookupQuery() {
      const type = document.getElementById("lookupEntityType").value;
      const entityVal = document.getElementById("lookupEntityItem").value;
      const depIdx = parseInt(document.getElementById("lookupDependencyRel").value, 10);
      const dep = lookupCurrentDependencies[depIdx];

      if (!dep) return;

      const endpoint = dep.method === "list-objects" ? "/list-objects" : "/list-users";
      const payload = dep.method === "list-objects"
        ? { user: entityVal, relation: dep.relation, type: dep.targetType }
        : { object: entityVal, relation: dep.relation, userType: dep.targetType };

      showLoading("Запрос к OpenFGA...", endpoint, payload);

      try {
        const { data, status } = await safeFetchJson(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const items = data.items || [];

        displayListResult(
          `Зависимости для ${entityVal} (${dep.label})`,
          `Найдено записей: ${items.length} (затрачено: ${data.durationMs || 0} ms)`,
          items,
          dep.targetType,
          endpoint,
          payload,
          status,
          data
        );

        // Трассировка графа
        const traceRes = await safeFetchJson("/trace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "lookup",
            user: dep.method === "list-objects" ? entityVal : undefined,
            object: dep.method === "list-users" ? entityVal : undefined,
            relation: dep.relation,
            userType: dep.targetType,
            items
          })
        });
        if (traceRes.data) {
          updateGraphFromTrace(traceRes.data);
        }

        renderJsonInspector(endpoint, payload, status, data);
      } catch (err) {
        showError(err.message, endpoint, payload);
      }
    }

    function syncCheckForm(user, relation, object) {
      if (!user || !object) return;
      const [uType] = user.split(":");
      const [oType] = object.split(":");

      const subTypeSel = document.getElementById("checkSubjectType");
      if (subTypeSel && subTypeSel.value !== uType) {
        subTypeSel.value = uType;
        onCheckSubjectTypeChange();
      }
      const subItemSel = document.getElementById("checkSubjectItem");
      if (subItemSel) {
        let found = Array.from(subItemSel.options).some(o => o.value === user);
        if (!found) {
          const opt = document.createElement("option");
          opt.value = user;
          opt.textContent = user;
          subItemSel.appendChild(opt);
        }
        subItemSel.value = user;
      }

      const tgtTypeSel = document.getElementById("checkTargetType");
      if (tgtTypeSel && tgtTypeSel.value !== oType) {
        tgtTypeSel.value = oType;
        onCheckTargetTypeChange();
      }
      const tgtItemSel = document.getElementById("checkTargetItem");
      if (tgtItemSel) {
        let found = Array.from(tgtItemSel.options).some(o => o.value === object);
        if (!found) {
          const opt = document.createElement("option");
          opt.value = object;
          opt.textContent = object;
          tgtItemSel.appendChild(opt);
        }
        tgtItemSel.value = object;
      }

      const relSel = document.getElementById("checkRelation");
      if (relSel && relation) {
        let found = Array.from(relSel.options).some(o => o.value === relation);
        if (!found) {
          const opt = document.createElement("option");
          opt.value = relation;
          opt.textContent = relation;
          relSel.appendChild(opt);
        }
        relSel.value = relation;
      }

      [subTypeSel, subItemSel, tgtTypeSel, tgtItemSel, relSel].forEach(el => {
        if (!el) return;
        el.style.transition = "background-color 0.3s ease";
        el.style.backgroundColor = "#e0f2fe";
        setTimeout(() => { el.style.backgroundColor = ""; }, 500);
      });
      updateLiveRequestPreview();
    }

    function syncLookupForm(entity, relation, targetType) {
      if (!entity) return;
      const [entityType] = entity.split(":");
      const typeSel = document.getElementById("lookupEntityType");
      if (typeSel && typeSel.value !== entityType) {
        typeSel.value = entityType;
        onLookupEntityTypeChange();
      }

      const itemSel = document.getElementById("lookupEntityItem");
      if (itemSel) {
        let found = Array.from(itemSel.options).some(o => o.value === entity);
        if (!found) {
          const opt = document.createElement("option");
          opt.value = entity;
          opt.textContent = entity;
          itemSel.appendChild(opt);
        }
        itemSel.value = entity;
        onLookupEntityItemChange();
      }

      if (relation) {
        const relSel = document.getElementById("lookupDependencyRel");
        const deps = lookupCurrentDependencies || [];
        const idx = deps.findIndex(d => d.relation === relation && (!targetType || d.targetType === targetType));
        if (idx !== -1 && relSel) {
          relSel.value = idx;
        }
      }

      [typeSel, itemSel, document.getElementById("lookupDependencyRel")].forEach(el => {
        if (!el) return;
        el.style.transition = "background-color 0.3s ease";
        el.style.backgroundColor = "#e0f2fe";
        setTimeout(() => { el.style.backgroundColor = ""; }, 500);
      });
      updateLiveRequestPreview();
    }

    // -------------------------------------------------------------
    // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ И ЧЕЛОВЕКОПОНЯТНЫЕ ОБЪЯСНЕНИЯ ОТВЕТОВ
    // -------------------------------------------------------------
    function getEmployeeInfo(val) {
      const username = String(val || "").replace(/^Employees:/, "");
      const emp = (tables?.employees || []).find(e => e.username === username);
      const repList = (tables?.replacings || []).filter(r => r.replacing_username === username);
      const rawName = emp ? emp.full_name : `Сотрудник ${username}`;
      const fullName = rawName.startsWith("Сотрудник ") ? rawName : `Сотрудник ${rawName}`;
      return {
        username,
        fullName,
        divisionId: emp ? emp.division_id : null,
        staffId: emp ? emp.staff_id : null,
        professionCode: emp ? emp.profession_code : null,
        replacings: repList,
        found: Boolean(emp)
      };
    }

    function getDivisionInfo(val) {
      const id = String(val || "").replace(/^Divisions:/, "");
      const div = (tables?.divisions || []).find(d => String(d.id) === id);
      return {
        id,
        name: div ? div.name : `Подразделение ${id}`,
        code: div ? (div.code || id) : id,
        fullCode: div ? (div.full_code || "") : "",
        parentId: div ? div.parent_id : null,
        found: Boolean(div)
      };
    }

    function getStaffInfo(val) {
      const id = String(val || "").replace(/^Staffs:/, "");
      const staff = (tables?.staffs || []).find(s => String(s.id) === id);
      const div = staff ? getDivisionInfo(staff.division_id) : null;
      const prof = staff ? (tables?.professions || []).find(p => p.code === staff.profession_code) : null;
      const holder = staff ? (tables?.employees || []).find(e => String(e.staff_id) === id) : null;
      return {
        id,
        divisionId: staff ? staff.division_id : null,
        divName: div ? div.name : "",
        professionCode: staff ? staff.profession_code : null,
        profName: prof ? prof.name : "",
        holderUsername: holder ? holder.username : null,
        holderName: holder ? `${holder.username} (${holder.full_name})` : null,
        found: Boolean(staff)
      };
    }

    function getRoleInfo(val) {
      const id = String(val || "").replace(/^Roles:/, "");
      const role = (tables?.roles || []).find(r => r.id === id);
      return {
        id,
        roleName: role ? role.role_name : `Роль ${id.slice(0, 8)}...`,
        username: role ? role.username : null,
        found: Boolean(role)
      };
    }

    function getProfessionInfo(val) {
      const code = String(val || "").replace(/^Professions:/, "");
      const prof = (tables?.professions || []).find(p => String(p.code) === code);
      return {
        code,
        name: prof ? prof.name : `Профессия ${code}`,
        found: Boolean(prof)
      };
    }

    function buildCheckExplanationHtml(user, relation, object, isAllowed, trace, durationMs, substitutionDepth = "chain") {
      const [uType, uId] = (user || "").split(":");
      const [oType, oId] = (object || "").split(":");

      // 1. Субъект
      let subTitle = user;
      let subSub = "";
      let subBadge = "";

      if (uType === "Employees") {
        const emp = getEmployeeInfo(uId);
        subTitle = `👤 ${emp.fullName}`;
        const div = emp.divisionId ? getDivisionInfo(emp.divisionId) : null;
        subSub = `Логин: <strong>${emp.username}</strong> | Отдел: ${div ? `${div.name} (${div.id})` : emp.divisionId || "—"} | Штатка: ${emp.staffId || "—"}`;
        if (emp.replacings && emp.replacings.length > 0) {
          const repBosses = emp.replacings.map(r => {
            const b = getEmployeeInfo(r.replaced_username);
            return `${b.fullName} (${r.replaced_username})`;
          }).join(", ");
          subBadge = `<div style="margin-top: 5px; font-size: 0.8rem; color: #b45309; background: #fffbeb; padding: 3px 8px; border-radius: 4px; border: 1px solid #fef3c7;">🔄 Замещает: <strong>${repBosses}</strong></div>`;
        }
      } else if (uType === "Divisions") {
        const div = getDivisionInfo(uId);
        subTitle = `🏢 ${div.name}`;
        subSub = `ID: <strong>${div.id}</strong>${div.fullCode ? ` | Путь: ${div.fullCode}` : ""}`;
      }

      // 2. Объект
      let objTitle = object;
      let objSub = "";

      if (oType === "Divisions") {
        const div = getDivisionInfo(oId);
        objTitle = `🏢 ${div.name}`;
        objSub = `ID: <strong>${div.id}</strong> | Код: ${div.code}${div.fullCode ? ` | Путь склейки: ${div.fullCode}` : ""}${div.parentId ? ` | Родитель: ${div.parentId}` : " (Головное подразделение)"}`;
      } else if (oType === "Staffs") {
        const st = getStaffInfo(oId);
        objTitle = `💼 Штатная позиция ${st.id}`;
        objSub = `Профессия: <strong>${st.profName || st.professionCode}</strong> | Подразделение: <strong>${st.divName || st.divisionId}</strong>${st.holderName ? `<br>Постоянный исполнитель: ${st.holderName}` : ""}`;
      } else if (oType === "Roles") {
        const ro = getRoleInfo(oId);
        objTitle = `🔑 ${ro.roleName}`;
        objSub = `ID: <strong>${ro.id}</strong>${ro.username ? ` | Первичное назначение: Сотрудник ${ro.username}` : ""}`;
      } else if (oType === "Professions") {
        const pr = getProfessionInfo(oId);
        objTitle = `🎓 ${pr.name}`;
        objSub = `Код: <strong>${pr.code}</strong>`;
      }

      // 3. Действие / Право
      let actionMeaning = "";
      if (relation === "can_use") {
        actionMeaning = "Целевое право доступа OpenFGA (полный расчет по графу модели).";
      } else if (relation === "can_use_chain") {
        actionMeaning = "Целевое право доступа: с учетом всей цепочки замещений до последнего сотрудника.";
      } else if (relation === "can_use_direct") {
        actionMeaning = "Целевое право доступа: с учетом строго 1-го уровня замещения (замещаемый сотрудник).";
      } else if (relation === "direct_assignee") {
        actionMeaning = "Строгая проверка персонального назначения роли в кадровом реестре (без замещений).";
      } else if (relation === "direct_employee") {
        actionMeaning = "Строгая проверка 1:1: является ли отдел или штатка первичным местом работы (без замещений).";
      } else if (relation === "substitute_direct_assignee") {
        actionMeaning = "Проверка наличия роли строго по 1-му уровню замещения сотрудника.";
      } else if (relation === "substitute_chain_assignee") {
        actionMeaning = "Проверка роли по цепочке замещений до последнего звена.";
      } else if (relation === "substitute_direct_employee") {
        actionMeaning = "Проверка отношения к отделу строго по 1-му уровню замещения.";
      } else if (relation === "substitute_chain_employee") {
        actionMeaning = "Проверка отношения к отделу по всей цепочке замещений.";
      } else if (relation === "substitute_employee") {
        actionMeaning = "Проверка доступа к отделу на основании замещения сотрудника.";
      } else if (relation === "assignee_direct") {
        actionMeaning = "Обладатель роли с учетом 1-го уровня замещения + личные назначения + гранты.";
      } else if (relation === "assignee_chain" || relation === "assignee") {
        actionMeaning = "Обладатель роли из любых источников (личные + вся цепочка + гранты).";
      } else if (relation === "employee_direct") {
        actionMeaning = "Сотрудник с учетом 1-го уровня замещения + личные прикрепления + подотделы + гранты.";
      } else if (relation === "employee_chain" || relation === "employee") {
        actionMeaning = "Сотрудник со всеми источниками (личные + вся цепочка + подотделы + гранты).";
      } else if (relation === "staff_assignee" || relation === "division_assignee") {
        actionMeaning = "Проверка назначения роли на штатную единицу или подразделение.";
      } else {
        actionMeaning = `Проверяемое отношение модели OpenFGA: "${relation}".`;
      }

      // 4. Причина ALLOW / DENY
      let reasonHeader = "";
      let reasonText = "";

      if (isAllowed) {
        if (uType === "Employees" && oType === "Divisions") {
          const emp = getEmployeeInfo(uId);
          const div = getDivisionInfo(oId);
          if (emp.divisionId === oId) {
            reasonHeader = "✅ Прямой доступ к своему подразделению (ALLOW)";
            reasonText = `<strong>${emp.fullName}</strong> числится в штате подразделения <strong>${div.name}</strong> (код: <code>${div.code}</code>, путь: <code>${div.fullCode}</code>). Доступ предоставлен на основании первичного трудоустройства без замещений.`;
          } else {
            const isMultiHop = trace && trace.nodes && trace.nodes.length >= 4;
            if (isMultiHop) {
              reasonHeader = "✅ Доступ унаследован по цепочке замещения (ALLOW, транзитивный доступ)";
              reasonText = `<strong>${emp.fullName}</strong> замещает по цепочке сотрудника 2-го+ уровня. Маршрут: <code>${trace.summary}</code>. При выборе режима «Вся цепочка (до последнего)» право <code>can_use</code> успешно предоставлено.`;
            } else {
              const rep = (emp.replacings || [])[0];
              const repEmp = rep ? getEmployeeInfo(rep.replaced_username) : null;
              reasonHeader = "✅ Доступ унаследован по замещению сотрудника (ALLOW)";
              reasonText = `<strong>${emp.fullName}</strong> временно замещает сотрудника <strong>${repEmp ? repEmp.fullName : "замещаемого"}</strong>. На период замещения сотруднику автоматически открыты права <code>can_use</code> на подразделение <strong>${div.name}</strong> и подотделы замещаемого сотрудника.`;
            }
          }
        } else if (uType === "Employees" && oType === "Staffs") {
          const emp = getEmployeeInfo(uId);
          const st = getStaffInfo(oId);
          if (emp.staffId === oId) {
            reasonHeader = "✅ Собственная штатная позиция (ALLOW)";
            reasonText = `<strong>${emp.fullName}</strong> занимает штатную единицу <strong>${st.id}</strong> (должность: <em>${st.profName}</em> в подразделении <em>${st.divName}</em>) как основное рабочее место.`;
          } else {
            reasonHeader = "✅ Штатная единица по замещению сотрудника (ALLOW)";
            reasonText = `<strong>${emp.fullName}</strong> временно замещает сотрудника на штатной позиции <strong>${st.id}</strong> (должность: <em>${st.profName}</em>). Полномочия должности активированы.`;
          }
        } else if (uType === "Employees" && oType === "Roles") {
          const emp = getEmployeeInfo(uId);
          const ro = getRoleInfo(oId);
          if (ro.username === uId) {
            reasonHeader = "✅ Прямое персональное назначение роли (ALLOW)";
            reasonText = `Роль <strong>${ro.roleName}</strong> назначена персонально для <strong>${emp.fullName}</strong> в кадровом реестре.`;
          } else {
            const isMultiHop = trace && trace.nodes && trace.nodes.length >= 4;
            if (isMultiHop) {
              reasonHeader = "✅ Роль унаследована по цепочке замещений (ALLOW, транзитивный доступ)";
              reasonText = `Роль <strong>${ro.roleName}</strong> получена транзитивно: <code>${trace.summary}</code>. Включенный режим «🔗 Вся цепочка (до последнего)» подтвердил передачу прав по всей цепочке.`;
            } else {
              reasonHeader = "✅ Роль унаследована от замещаемого сотрудника (ALLOW)";
              reasonText = `Роль <strong>${ro.roleName}</strong> принадлежит замещаемому сотруднику. <strong>${emp.fullName}</strong> унаследовал право использования роли по замещению.`;
            }
          }
        } else {
          reasonHeader = "✅ Право доступа подтверждено (ALLOW)";
          reasonText = `Запрос успешно авторизован ядром OpenFGA. Право <code>${relation}</code> подтверждено для субъекта.`;
        }
      } else {
        // DENIED
        if (trace && trace.summary && trace.summary.includes("Ограничение 1-го уровня")) {
          reasonHeader = "❌ Ограничение 1-го уровня: цепочка заблокирована (DENY)";
          reasonText = `Включен строгий режим «🎯 Только 1-е замещение». ${trace.summary}. Чтобы разрешить передачу прав через последующие звенья цепочки, выберите переключатель «🔗 Вся цепочка (до последнего)».`;
        } else if (uType === "Employees" && oType === "Divisions") {
          const emp = getEmployeeInfo(uId);
          const div = getDivisionInfo(oId);
          const ownDiv = emp.divisionId ? getDivisionInfo(emp.divisionId) : null;

          if (relation === "direct_employee") {
            const rep = (emp.replacings || []).find(r => {
              const repEmp = getEmployeeInfo(r.replaced_username);
              return repEmp.divisionId === oId;
            });
            if (rep) {
              const repEmp = getEmployeeInfo(rep.replaced_username);
              reasonHeader = "❌ Замещение не меняет первичное прикрепление (DENY)";
              reasonText = `<strong>Важный принцип модели:</strong> <strong>${emp.fullName}</strong> замещает сотрудника <strong>${repEmp.fullName}</strong> и имеет право управления (<code>can_use = ALLOW</code>).<br>Однако его <em>первичным местом работы</em> (<code>direct_employee</code>) остается отдел <strong>${ownDiv ? ownDiv.name : emp.divisionId}</strong>. Замещение дает временные права замещаемого сотрудника, но не перезаписывает постоянную кадровую принадлежность сотрудника.`;
            } else {
              reasonHeader = "❌ Сотрудник не числится в данном отделе (DENY)";
              reasonText = `<strong>${emp.fullName}</strong> прикреплен к подразделению <strong>${ownDiv ? ownDiv.name : emp.divisionId}</strong> и не имеет прямого прикрепления к подразделению <strong>${div.name}</strong>.`;
            }
          } else {
            reasonHeader = "❌ Подразделение недоступно (DENY)";
            reasonText = `<strong>${emp.fullName}</strong> (основной отдел: <em>${ownDiv ? ownDiv.name : emp.divisionId}</em>) не имеет отношения к подразделению <strong>${div.name}</strong>. Отдел не является его прямым местом работы, не входит в оргструктуру замещаемого сотрудника и не покрыт грантами.`;
          }
        } else if (uType === "Employees" && oType === "Roles") {
          const emp = getEmployeeInfo(uId);
          const ro = getRoleInfo(oId);
          if (relation === "direct_assignee") {
            reasonHeader = "❌ Роль не назначена напрямую (DENY)";
            reasonText = `<strong>${emp.fullName}</strong> может использовать эту роль по замещению (<code>can_use = ALLOW</code>), однако личного прямого приказа о назначении (<code>direct_assignee</code>) у него нет.`;
          } else {
            reasonHeader = "❌ Нет прав на данную роль (DENY)";
            reasonText = `Роль <strong>${ro.roleName}</strong> не назначена для <strong>${emp.fullName}</strong> лично, не принадлежит замещаемым им лицам (с учетом текущей глубины) и не выдана грантом.`;
          }
        } else if (uType === "Employees" && oType === "Staffs") {
          const emp = getEmployeeInfo(uId);
          const st = getStaffInfo(oId);
          reasonHeader = "❌ Чужая штатная единица (DENY)";
          reasonText = `Штатная единица <strong>${st.id}</strong> (${st.profName || st.professionCode} в отделе ${st.divName || st.divisionId}) закреплена за другим сотрудником и не входит в список замещений для <strong>${emp.fullName}</strong>.`;
        } else {
          reasonHeader = "❌ Доступ запрещен моделью безопасности (DENY)";
          reasonText = `Субъект не обладает правом <code>${relation}</code> в отношении выбранного объекта. Ни прямых связей, ни замещений или грантов не найдено.`;
        }
      }

      const routeSummary = trace && trace.summary ? trace.summary : `${user} —[ ${relation} ]—> ${object}`;
      const cardClass = isAllowed ? "allow" : "deny";

      return `
        <div class="result-entity-grid">
          <div class="result-entity-item">
            <label>👤 Субъект запроса</label>
            <div>${subTitle}</div>
            <small>${subSub}</small>
            ${subBadge}
          </div>
          <div class="result-entity-item">
            <label>🎯 Целевой объект</label>
            <div>${objTitle}</div>
            <small>${objSub}</small>
          </div>
          <div class="result-entity-item">
            <label>⚙️ Проверяемое право</label>
            <div><code>${relation}</code></div>
            <small>${actionMeaning}</small>
          </div>
        </div>

        <div class="result-reason-card ${cardClass}">
          <h4>${reasonHeader}</h4>
          <div>${reasonText}</div>
          <div class="result-path-hint">
            <span>🗺️ <strong>Маршрут в графе:</strong></span>
            <span>${routeSummary}</span>
          </div>
        </div>
      `;
    }

    function buildLookupExplanationHtml(reqPayload, items, type, resData, trace) {
      const entity = reqPayload.user || reqPayload.object || "";
      const relation = reqPayload.relation || "";
      const [eType, eId] = entity.split(":");
      const count = items ? items.length : 0;
      const durationMs = resData?.durationMs ?? 0;

      let entityTitle = entity;
      let entitySub = "";
      if (eType === "Employees") {
        const emp = getEmployeeInfo(eId);
        entityTitle = `👤 ${emp.fullName}`;
        entitySub = `Логин: <strong>${emp.username}</strong> | Отдел: ${emp.divisionId || "—"} | Штатка: ${emp.staffId || "—"}`;
      } else if (eType === "Divisions") {
        const div = getDivisionInfo(eId);
        entityTitle = `🏢 ${div.name}`;
        entitySub = `ID: <strong>${div.id}</strong> | Код: ${div.code} | Путь: ${div.fullCode || div.id}`;
      } else if (eType === "Roles") {
        const ro = getRoleInfo(eId);
        entityTitle = `🔑 ${ro.roleName}`;
        entitySub = `ID: <strong>${ro.id}</strong>`;
      } else if (eType === "Staffs") {
        const st = getStaffInfo(eId);
        entityTitle = `💼 Штатка ${st.id}`;
        entitySub = `${st.profName || st.professionCode} (${st.divName || st.divisionId})`;
      }

      let depLabel = relation;
      let reasonHeader = `ℹ️ Найдено записей: ${count} (${durationMs} ms)`;
      let reasonText = "";

      if (eType === "Employees") {
        const emp = getEmployeeInfo(eId);
        const rep = (emp.replacings || [])[0];
        const repEmp = rep ? getEmployeeInfo(rep.replaced_username) : null;

        if (relation === "all_divisions") {
          depLabel = "all_divisions (Все доступные подразделения)";
          reasonText = `Возвращены все подразделения, доступные для <strong>${emp.fullName}</strong> в системе:<br>
          1) Прямой отдел сотрудника (отдел <strong>${emp.divisionId}</strong>);<br>
          ${repEmp ? `2) Головной отдел замещаемого сотрудника <strong>${repEmp.fullName}</strong> (отдел <strong>${repEmp.divisionId}</strong>);<br>
          3) Все дочерние подчиненные отделы замещаемого сотрудника вниз по дереву оргструктуры.<br>` : ""}
          Итого доступно для работы: <strong>${count}</strong> отделов.`;
        } else if (relation === "staff") {
          depLabel = "staff (Все доступные штатные единицы)";
          reasonText = `Возвращены штатные единицы, в которых сотрудник имеет полномочия:<br>
          • Личная постоянная штатка сотрудника: <code>${emp.staffId}</code>;<br>
          ${rep ? `• Штатка замещаемого сотрудника <strong>${repEmp ? repEmp.fullName : rep.replaced_username}</strong>: <code>${rep.staff_id}</code>.<br>` : ""}
          Всего штатных позиций с правами: <strong>${count}</strong>.`;
        } else if (relation === "staff_from_replaced") {
          depLabel = "staff_from_replaced (Штатка замещаемого сотрудника)";
          reasonText = `Штатная позиция замещаемого сотрудника <strong>${repEmp ? repEmp.fullName : "—"}</strong>. Сотрудник наделен полномочиями на этой позиции на время замещения.`;
        } else if (relation === "division_from_replaced") {
          depLabel = "division_from_replaced (Головной отдел замещаемого сотрудника)";
          reasonText = `Головное подразделение, которое занимает замещаемый сотрудник <strong>${repEmp ? repEmp.fullName : "—"}</strong>.`;
        } else if (relation === "descendant_division_from_replaced") {
          depLabel = "descendant_division_from_replaced (Подчиненные отделы замещаемого сотрудника)";
          reasonText = `Все подразделения оргструктуры, находящиеся в подчинении у отдела замещаемого сотрудника <strong>${repEmp ? repEmp.fullName : "—"}</strong>. Всего подотделов: <strong>${count}</strong>.`;
        } else if (relation === "direct_division") {
          depLabel = "direct_division (Прямой отдел сотрудника)";
          reasonText = `Основное постоянное подразделение сотрудника по трудовому договору (инвариант 1:1). Возвращает строго 1 отдел (<code>${emp.divisionId}</code>).`;
        } else if (relation === "direct_staff") {
          depLabel = "direct_staff (Прямая штатная единица)";
          reasonText = `Персональная штатная единица сотрудника по штатному расписанию (инвариант 1:1). Возвращает строго 1 позицию (<code>${emp.staffId}</code>).`;
        } else if (relation === "assignee" || relation === "role_from_replaced") {
          depLabel = `${relation} (Роли доступа)`;
          reasonText = `Список всех ролей доступа, которыми наделен <strong>${emp.fullName}</strong> (включая личные назначения и переданные в рамках замещения).`;
        } else {
          reasonText = `Выполнена выборка связанных сущностей типа <strong>${type}</strong> для <strong>${emp.fullName}</strong> по отношению <code>${relation}</code>.`;
        }
      } else if (eType === "Divisions") {
        const div = getDivisionInfo(eId);
        if (relation === "child") {
          depLabel = "child (Прямые дочерние отделы)";
          reasonText = `Непосредственные дочерние подразделения 1-го уровня вложенности для отдела <strong>${div.name}</strong> (код: <code>${div.code}</code>).`;
        } else if (relation === "descendant") {
          depLabel = "descendant (Все подчиненные отделы вниз по дереву)";
          reasonText = `Полная иерархическая ветка подразделений под управлением отдела <strong>${div.name}</strong> на всех уровнях вложенности. Всего подчиненных подразделений: <strong>${count}</strong>.`;
        } else if (relation === "ancestor") {
          depLabel = "ancestor (Вышестоящие отделы вверх по дереву)";
          reasonText = `Цепочка родительских подразделений от отдела <strong>${div.name}</strong> вверх до корневого департамента организации.`;
        } else if (relation === "direct_employee") {
          depLabel = "direct_employee (Сотрудники напрямую)";
          reasonText = `Сотрудники, для которых подразделение <strong>${div.name}</strong> является основным постоянным местом работы (без учета подотделов).`;
        } else if (relation === "employee") {
          depLabel = "employee (Все сотрудники отдела и подотделов)";
          reasonText = `Все сотрудники, работающие в подразделении <strong>${div.name}</strong>, его дочерних отделах или выполняющие обязанности по замещению.`;
        } else {
          reasonText = `Выборка связанных сущностей типа <strong>${type}</strong> для подразделения <strong>${div.name}</strong> по связи <code>${relation}</code>.`;
        }
      } else {
        reasonText = `Выборка связанных сущностей типа <strong>${type}</strong> для <code>${entity}</code> по отношению <code>${relation}</code>.`;
      }

      const routeSummary = trace && trace.summary ? trace.summary : `${entity} —[ ${relation} ]—> [${type}]`;

      return `
        <div class="result-entity-grid">
          <div class="result-entity-item">
            <label>📍 Исходный объект</label>
            <div>${entityTitle}</div>
            <small>${entitySub}</small>
          </div>
          <div class="result-entity-item">
            <label>🔗 Запрашиваемая зависимость</label>
            <div><code>${depLabel}</code></div>
            <small>Найдено: <strong>${count}</strong> объектов</small>
          </div>
          <div class="result-entity-item">
            <label>📦 Тип целевых элементов</label>
            <div><strong>${type}</strong></div>
            <small>Время выборки OpenFGA: ${durationMs} ms</small>
          </div>
        </div>

        <div class="result-reason-card info">
          <h4>${reasonHeader}</h4>
          <div>${reasonText}</div>
          <div class="result-path-hint">
            <span>🗺️ <strong>Трассировка поиска:</strong></span>
            <span>${routeSummary}</span>
          </div>
        </div>
      `;
    }

    function buildBatchExplanationHtml(payload, data) {
      const checks = payload.checks || [];
      const results = data.result || {};
      const durationMs = data.durationMs || 0;

      const cardHtmls = checks.map((c) => {
        const resItem = results[c.correlation_id];
        const isAllowed = Boolean(resItem?.allowed);
        const u = c.tuple_key.user;
        const r = c.tuple_key.relation;
        const o = c.tuple_key.object;
        const [uType, uId] = u.split(":");
        const [oType, oId] = o.split(":");

        const emp = uType === "Employees" ? getEmployeeInfo(uId) : null;
        const div = oType === "Divisions" ? getDivisionInfo(oId) : null;
        const st = oType === "Staffs" ? getStaffInfo(oId) : null;

        let title = "";
        let desc = "";
        if (isAllowed) {
          if (oType === "Divisions") {
            if (emp && emp.divisionId === oId) {
              title = "🟢 ALLOW: Свой отдел";
              desc = `${emp.fullName} числится в отделе ${div?.name || oId} напрямую.`;
            } else {
              title = "🟢 ALLOW: Отдел по замещению";
              desc = `Доступ унаследован через временное замещение сотрудника.`;
            }
          } else if (oType === "Staffs") {
            title = "🟢 ALLOW: Штатка по замещению";
            desc = `Сотрудник временно замещает сотрудника на позиции ${st?.id} (${st?.profName || ""}).`;
          } else {
            title = "🟢 ALLOW: Доступ разрешен";
            desc = `Право ${r} подтверждено для ${u}.`;
          }
        } else {
          if (emp && oType === "Divisions") {
            title = "🔴 DENIED: Чужой отдел";
            desc = `${emp.fullName} числится в отделе ${emp.divisionId} и не имеет отношения к ${div?.name || oId}.`;
          } else {
            title = "🔴 DENIED: Доступ запрещен";
            desc = `Право ${r} отсутствует для ${u}.`;
          }
        }

        const badgeClass = isAllowed ? "badge-status-ok" : "badge-status-err";
        const itemBorderClass = isAllowed ? "allow" : "deny";

        return `
          <div class="batch-card-item ${itemBorderClass}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-weight: 700; font-size: 0.88rem;">${title}</span>
              <span class="badge-status ${badgeClass}">${isAllowed ? "ALLOW" : "DENY"}</span>
            </div>
            <div style="font-size: 0.8rem; color: #475569; margin-bottom: 4px;">
              <code>${u}</code> ➔ <code>${r}</code> ➔ <code>${o}</code>
            </div>
            <div style="font-size: 0.82rem; color: #1e293b;">${desc}</div>
          </div>
        `;
      }).join("");

      return `
        <div class="result-reason-card info" style="margin-bottom: 8px;">
          <h4>⚡ Результаты параллельной пакетной проверки (${checks.length} проверок за ${durationMs} ms)</h4>
          <div>Пакетная проверка выполнена через метод OpenFGA <code>BatchCheck</code> в одном HTTP-запросе. Каждый кортеж проверен независимо с учетом прямых назначений и замещений:</div>
        </div>
        <div class="batch-cards-grid">
          ${cardHtmls}
        </div>
      `;
    }

    const BATCH_SCENARIOS = {
      default: [
        { correlation_id: "check-1-division-own", user: "Employees:34491", relation: "can_use", object: "Divisions:215" },
        { correlation_id: "check-2-division-by-replacing", user: "Employees:66211", relation: "can_use", object: "Divisions:787" },
        { correlation_id: "check-3-staff-by-replacing", user: "Employees:34491", relation: "can_use", object: "Staffs:17363" },
        { correlation_id: "check-4-division-stranger-denied", user: "Employees:34491", relation: "can_use", object: "Divisions:787" }
      ],
      substitute34491: [
        { correlation_id: "check-1-own-div", user: "Employees:34491", relation: "can_use", object: "Divisions:215" },
        { correlation_id: "check-2-boss-div", user: "Employees:34491", relation: "can_use", object: "Divisions:755" },
        { correlation_id: "check-3-boss-staff", user: "Employees:34491", relation: "can_use", object: "Staffs:17363" },
        { correlation_id: "check-4-direct-deny", user: "Employees:34491", relation: "direct_employee", object: "Divisions:755" }
      ],
      canUseVsDirect: [
        { correlation_id: "check-1-boss-direct-allow", user: "Employees:42179", relation: "direct_employee", object: "Divisions:755" },
        { correlation_id: "check-2-sub-direct-deny", user: "Employees:34491", relation: "direct_employee", object: "Divisions:755" },
        { correlation_id: "check-3-sub-canuse-allow", user: "Employees:34491", relation: "can_use", object: "Divisions:755" },
        { correlation_id: "check-4-sub-own-direct-allow", user: "Employees:34491", relation: "direct_employee", object: "Divisions:215" }
      ],
      rolesAndSubstitutions: [
        { correlation_id: "check-1-role-by-replacing", user: "Employees:34491", relation: "can_use", object: "Roles:c66452e0-23c5-5cbf-97fa-07b1480465dc" },
        { correlation_id: "check-2-role-direct-denied", user: "Employees:34491", relation: "direct_assignee", object: "Roles:c66452e0-23c5-5cbf-97fa-07b1480465dc" },
        { correlation_id: "check-3-role-chain-level2", user: "Employees:34491", relation: "can_use_chain", object: "Roles:bd38f78f-7ad0-595e-81d6-06b970a7e9c3" },
        { correlation_id: "check-4-role-stranger-denied", user: "Employees:68997", relation: "can_use", object: "Roles:c66452e0-23c5-5cbf-97fa-07b1480465dc" }
      ]
    };

    let currentBatchChecks = JSON.parse(JSON.stringify(BATCH_SCENARIOS.default));

    function loadBatchScenario(key) {
      const scenario = BATCH_SCENARIOS[key];
      if (!scenario) return;
      currentBatchChecks = JSON.parse(JSON.stringify(scenario));
      
      const btnMap = {
        default: "btnScenarioDefault",
        substitute34491: "btnScenarioSubstitute34491",
        canUseVsDirect: "btnScenarioCanUseVsDirect",
        rolesAndSubstitutions: "btnScenarioRolesAndSubstitutions"
      };
      Object.keys(btnMap).forEach(k => {
        const btn = document.getElementById(btnMap[k]);
        if (btn) btn.className = "batch-scenario-btn" + (k === key ? " active" : "");
      });

      renderBatchTable();
    }

    function renderBatchTable() {
      const tbody = document.getElementById("batchTableBody");
      const countEl = document.getElementById("batchCountBadge");
      if (!tbody) return;
      tbody.innerHTML = "";

      if (countEl) countEl.textContent = currentBatchChecks.length;

      if (currentBatchChecks.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 14px;">Список проверок пуст. Выберите готовый сценарий выше или добавьте кортеж вручную.</td></tr>`;
        return;
      }

      currentBatchChecks.forEach((c, idx) => {
        const tr = document.createElement("tr");

        let subDesc = c.user;
        if (c.user.startsWith("Employees:")) {
          const emp = getEmployeeInfo(c.user);
          subDesc = `👤 ${emp.fullName} (<code>${emp.username}</code>)`;
        } else if (c.user.startsWith("Divisions:")) {
          const div = getDivisionInfo(c.user);
          subDesc = `🏢 ${div.name}`;
        }

        let objDesc = c.object;
        if (c.object.startsWith("Divisions:")) {
          const div = getDivisionInfo(c.object);
          objDesc = `🏢 ${div.name}${div.fullCode ? ` [${div.fullCode}]` : ""}`;
        } else if (c.object.startsWith("Staffs:")) {
          const st = getStaffInfo(c.object);
          objDesc = `💼 Штатка ${st.id} (${st.profName || st.professionCode})`;
        } else if (c.object.startsWith("Roles:")) {
          const ro = getRoleInfo(c.object);
          objDesc = `🔑 ${ro.roleName}`;
        } else if (c.object.startsWith("Professions:")) {
          const pr = getProfessionInfo(c.object);
          objDesc = `🎓 ${pr.name}`;
        }

        tr.innerHTML = `
          <td style="text-align: center; font-weight: 700; color: #64748b;">${idx + 1}</td>
          <td>${subDesc}</td>
          <td><span class="preset-method-tag" style="background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;">${c.relation}</span></td>
          <td>${objDesc}</td>
          <td style="text-align: center;">
            <button type="button" class="btn-remove-row" onclick="removeCheckFromBatch(${idx})" title="Удалить проверку из пачки">✕</button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      if (currentActiveTab === "batch") {
        updateLiveRequestPreview();
      }
    }

    function initBatchDropdowns() {
      const subSel = document.getElementById("batchAddSubject");
      const objSel = document.getElementById("batchAddObject");
      if (!subSel || !objSel || !tables) return;

      subSel.innerHTML = "";
      (tables.employees || []).slice(0, 30).forEach(e => {
        const opt = document.createElement("option");
        opt.value = `Employees:${e.username}`;
        opt.textContent = formatEmployeeOptionLabel(e, tables);
        subSel.appendChild(opt);
      });

      objSel.innerHTML = "";
      const optGroupDiv = document.createElement("optgroup");
      optGroupDiv.label = "Подразделения (Divisions)";
      (tables.divisions || []).slice(0, 15).forEach(d => {
        const opt = document.createElement("option");
        opt.value = `Divisions:${d.id}`;
        opt.textContent = `${d.id} — ${d.name}${d.full_code ? ` [${d.full_code}]` : ""}`;
        optGroupDiv.appendChild(opt);
      });
      objSel.appendChild(optGroupDiv);

      const optGroupProf = document.createElement("optgroup");
      optGroupProf.label = "Профессии (Professions)";
      (tables.professions || []).slice(0, 10).forEach(p => {
        const opt = document.createElement("option");
        opt.value = `Professions:${p.code}`;
        opt.textContent = `${p.code} — ${p.name}`;
        optGroupProf.appendChild(opt);
      });
      objSel.appendChild(optGroupProf);

      const optGroupStaff = document.createElement("optgroup");
      optGroupStaff.label = "Штатные единицы (Staffs)";
      (tables.staffs || []).slice(0, 10).forEach(s => {
        const opt = document.createElement("option");
        opt.value = `Staffs:${s.id}`;
        opt.textContent = `Штатка ${s.id} (отдел ${s.division_id})`;
        optGroupStaff.appendChild(opt);
      });
      objSel.appendChild(optGroupStaff);

      const optGroupRoles = document.createElement("optgroup");
      optGroupRoles.label = "Роли (Roles)";
      (tables.roles || []).forEach(r => {
        const opt = document.createElement("option");
        opt.value = `Roles:${r.id}`;
        opt.textContent = `${r.role_name} (${r.id.slice(0, 8)}...)`;
        optGroupRoles.appendChild(opt);
      });
      objSel.appendChild(optGroupRoles);
    }

    function addCheckToBatch() {
      const user = document.getElementById("batchAddSubject")?.value;
      const relation = document.getElementById("batchAddRelation")?.value;
      const object = document.getElementById("batchAddObject")?.value;
      if (!user || !relation || !object) return;

      const id = `check-${currentBatchChecks.length + 1}-${Date.now().toString().slice(-4)}`;
      currentBatchChecks.push({ correlation_id: id, user, relation, object });
      renderBatchTable();
    }

    function removeCheckFromBatch(idx) {
      currentBatchChecks.splice(idx, 1);
      renderBatchTable();
    }

    function clearBatchChecks() {
      currentBatchChecks = [];
      renderBatchTable();
    }

    async function executeBatchFromTab() {
      if (!currentBatchChecks || currentBatchChecks.length === 0) {
        alert("Список проверок пуст. Добавьте хотя бы одну проверку или выберите готовый сценарий.");
        return;
      }

      const endpoint = "/batch-check";
      const payload = {
        checks: currentBatchChecks.map((c, i) => ({
          correlation_id: c.correlation_id || `check-${i + 1}`,
          tuple_key: {
            user: c.user,
            relation: c.relation,
            object: c.object
          }
        }))
      };

      showLoading(`Выполнение пакетной проверки (${currentBatchChecks.length} проверок)...`, endpoint, payload);

      try {
        const { data, status } = await safeFetchJson(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const box = document.getElementById("resultBox");
        box.style.display = "block";
        box.className = "box banner-info";

        const checkBar = document.getElementById("resultCheckBar");
        if (checkBar) checkBar.style.display = "none";

        const resTitle = document.getElementById("resultTitle");
        if (resTitle) {
          resTitle.style.display = "block";
          resTitle.textContent = `⚡ Пакетная проверка (Batch Check): ${data.count} проверок за 1 вызов`;
        }
        const resMeta = document.getElementById("resultMeta");
        if (resMeta) {
          resMeta.style.display = "block";
          resMeta.textContent = `Все ${data.count} проверок выполнены параллельно OpenFGA (затрачено: ${data.durationMs || 0} ms)`;
        }

        const lines = payload.checks.map(c => {
          const resItem = data.result?.[c.correlation_id];
          const isAllowed = resItem?.allowed;
          const st = isAllowed ? "✓ ALLOWED" : "✗ DENIED";
          const icon = isAllowed ? "🟢" : "🔴";
          return `${icon} [${st}] (${c.correlation_id}):\n   ${c.tuple_key.user} —[ ${c.tuple_key.relation} ]—> ${c.tuple_key.object}`;
        }).join("\n\n");

        const resList = document.getElementById("resultList");
        if (resList) {
          resList.style.display = "block";
          resList.textContent = lines;
        }

        const explBox = document.getElementById("resultExplanationBox");
        if (explBox) {
          explBox.innerHTML = buildBatchExplanationHtml(payload, data);
          explBox.style.display = "flex";
        }

        renderJsonInspector(endpoint, payload, status, data);
      } catch (err) {
        showError(err.message, endpoint, payload);
      }
    }

    async function runPresetBatchCheck() {
      switchTab("batch");
      loadBatchScenario("default");
      await executeBatchFromTab();
    }

    async function runPresetCheck(user, relation, object, title) {
      switchTab("check");
      const chk = document.getElementById("enableContextualTuples");
      if (chk && chk.checked) {
        chk.checked = false;
        onToggleContextualTuples();
      }
      syncCheckForm(user, relation, object);
      await runCheckInternal(user, relation, object, title);
    }

    async function runCheckInternal(user, relation, object, title, contextualTuples = null) {
      const endpoint = "/check";
      const payload = { user, relation, object };
      if (contextualTuples && Array.isArray(contextualTuples) && contextualTuples.length > 0) {
        payload.contextual_tuples = contextualTuples;
      }
      showLoading(`Проверка OpenFGA: ${user} -> ${relation} -> ${object}...`, endpoint, payload);

      try {
        const { data, status } = await safeFetchJson(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const box = document.getElementById("resultBox");
        box.style.display = "block";
        
        const isAllowed = Boolean(data.allowed);
        const bannerClass = isAllowed ? "banner-allow" : "banner-deny";
        box.className = "box compact-result-box " + bannerClass;

        const checkBar = document.getElementById("resultCheckBar");
        if (checkBar) {
          checkBar.style.display = "flex";
          const pill = document.getElementById("resultPill");
          if (pill) {
            pill.className = isAllowed ? "result-pill pill-allow" : "result-pill pill-deny";
            pill.textContent = isAllowed ? "🟢 ALLOW" : "🔴 DENY";
          }
          const summary = document.getElementById("resultSummaryText");
          if (summary) {
            summary.textContent = `${user} —[ ${relation} ]—> ${object}${contextualTuples ? " ⚡ [контекст]" : ""}`;
          }
          const dur = document.getElementById("resultDurationBadge");
          if (dur) {
            dur.textContent = `${data.durationMs || 0} ms`;
          }
        }

        const resTitle = document.getElementById("resultTitle");
        if (resTitle) resTitle.style.display = "none";
        const resMeta = document.getElementById("resultMeta");
        if (resMeta) resMeta.style.display = "none";
        const resList = document.getElementById("resultList");
        if (resList) resList.style.display = "none";
        const explBox = document.getElementById("resultExplanationBox");
        if (explBox) {
          explBox.style.display = "none";
          explBox.innerHTML = "";
        }

        renderJsonInspector(endpoint, payload, status, data);

        let trace = null;
        try {
          trace = traceResolutionPath({
            type: "check",
            user,
            relation,
            object,
            contextualTuples,
            allowed: isAllowed
          }, tables);
          updateGraphFromTrace(trace);
        } catch (e) {
          console.warn("Ошибка построения графа:", e);
        }
      } catch (err) {
        showError(err.message, endpoint, payload);
      }
    }

    async function runPresetListObjects(user, relation, type, title) {
      switchTab("lookup");
      syncLookupForm(user, relation, type);
      const endpoint = "/list-objects";
      const payload = { user, relation, type };
      showLoading(`Запрос: ${title}...`, endpoint, payload);

      try {
        const { data, status } = await safeFetchJson(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        displayListResult(title, `Найдено объектов (${type}): ${data.count} (затрачено: ${data.durationMs || 0} ms)`, data.items || [], type, endpoint, payload, status, data);
      } catch (err) {
        showError(err.message, endpoint, payload);
      }
    }

    async function runPresetListUsers(object, relation, userType, title) {
      switchTab("lookup");
      syncLookupForm(object, relation, userType);
      const endpoint = "/list-users";
      const payload = { object, relation, userType };
      showLoading(`Запрос: ${title}...`, endpoint, payload);

      try {
        const { data, status } = await safeFetchJson(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        displayListResult(title, `Найдено пользователей (${userType}): ${data.count} (затрачено: ${data.durationMs || 0} ms)`, data.items || [], userType, endpoint, payload, status, data);
      } catch (err) {
        showError(err.message, endpoint, payload);
      }
    }

    function displayListResult(title, meta, items, type, endpoint, reqPayload, status, resData) {
      const box = document.getElementById("resultBox");
      box.style.display = "block";
      box.className = "box banner-info";

      const checkBar = document.getElementById("resultCheckBar");
      if (checkBar) checkBar.style.display = "none";

      const resTitle = document.getElementById("resultTitle");
      if (resTitle) {
        resTitle.style.display = "block";
        resTitle.textContent = title;
      }
      const resMeta = document.getElementById("resultMeta");
      if (resMeta) {
        resMeta.style.display = "block";
        resMeta.textContent = meta;
      }
      const resList = document.getElementById("resultList");
      if (resList) resList.style.display = "block";

      if (!items || items.length === 0) {
        if (resList) resList.textContent = "Связанные объекты не найдены (пустой массив)";
      } else {
        const formatted = items.map(id => {
          let desc = "";
          if (type === "Employees") {
            const emp = (tables.employees || []).find(e => e.username === id);
            if (emp) desc = ` — ${emp.full_name}`;
          } else if (type === "Divisions") {
            const div = (tables.divisions || []).find(d => d.id === id);
            if (div) desc = ` — ${div.name}${div.full_code ? ` (код: ${div.code || div.id}, путь: ${div.full_code})` : ""}`;
          } else if (type === "Professions") {
            const prof = (tables.professions || []).find(p => p.code === id);
            if (prof) desc = ` — ${prof.name}`;
          } else if (type === "Roles") {
            const role = (tables.roles || []).find(r => r.id === id);
            if (role) desc = ` (${role.role_name})`;
          } else if (type === "Staffs") {
            const staff = (tables.staffs || []).find(s => s.id === id);
            if (staff) {
              const div = (tables.divisions || []).find(d => d.id === staff.division_id);
              const prof = (tables.professions || []).find(p => p.code === staff.profession_code);
              const emp = (tables.employees || []).find(e => e.staff_id === id);
              const divName = div ? div.name : `отдел ${staff.division_id}`;
              const profName = prof ? prof.name : `проф. ${staff.profession_code}`;
              const empName = emp ? ` [занимает: ${emp.username} ${emp.full_name}]` : "";
              desc = ` — ${profName} (${divName})${empName}`;
            }
          }
          return `• ${id}${desc}`;
        }).join("\n");
        document.getElementById("resultList").textContent = formatted;
      }

      renderJsonInspector(endpoint, reqPayload, status, resData);

      let trace = null;
      try {
        trace = traceResolutionPath({
          type: "lookup",
          user: reqPayload.user,
          object: reqPayload.object,
          relation: reqPayload.relation,
          userType: reqPayload.userType || reqPayload.type,
          items: items || []
        }, tables);
        updateGraphFromTrace(trace);
      } catch (e) {
        console.warn("Ошибка построения графа:", e);
      }

      const explBox = document.getElementById("resultExplanationBox");
      if (explBox) {
        explBox.innerHTML = buildLookupExplanationHtml(reqPayload, items, type, resData, trace);
        explBox.style.display = "flex";
      }
    }

    function renderJsonInspector(endpoint, reqPayload, status, resData) {
      lastExecutedRequest = { endpoint, payload: reqPayload };
      lastExecutedResponse = { status, data: resData };
      currentPreviewRequest = { endpoint, payload: reqPayload };

      const reqBadge = document.getElementById("reqBadge");
      if (reqBadge) reqBadge.textContent = `POST ${endpoint}`;

      const reqPdpBadge = document.getElementById("reqPdpBadge");
      if (reqPdpBadge) {
        let pdpRoute = "/stores/{store_id}/check";
        if (endpoint === "/list-objects") pdpRoute = "/stores/{store_id}/list-objects";
        else if (endpoint === "/list-users") pdpRoute = "/stores/{store_id}/list-users";
        else if (endpoint === "/batch-check") pdpRoute = "/stores/{store_id}/batch-check";
        reqPdpBadge.textContent = `OpenFGA: POST ${pdpRoute}`;
      }

      const reqModeBadge = document.getElementById("reqModeBadge");
      if (reqModeBadge) {
        reqModeBadge.className = "badge-preview-sent";
        reqModeBadge.innerHTML = "📤 Запрос отправлен (200 OK)";
      }

      const jsonReq = document.getElementById("jsonRequest");
      if (jsonReq) jsonReq.textContent = JSON.stringify(reqPayload, null, 2);

      const resBadge = document.getElementById("resBadge");
      const resDuration = document.getElementById("resDuration");
      if (resBadge) {
        if (status >= 200 && status < 300) {
          resBadge.className = "badge-status badge-status-ok";
          resBadge.textContent = `${status} OK`;
          if (resDuration) resDuration.textContent = `(${resData?.durationMs ?? 0} ms)`;
        } else {
          resBadge.className = "badge-status badge-status-err";
          resBadge.textContent = `${status} ERROR`;
          if (resDuration) resDuration.textContent = "";
        }
      }

      const jsonRes = document.getElementById("jsonResponse");
      if (jsonRes) jsonRes.textContent = JSON.stringify(resData, null, 2);
    }

    function showLoading(msg, endpoint, payload) {
      const box = document.getElementById("resultBox");
      box.style.display = "block";
      
      const checkBar = document.getElementById("resultCheckBar");
      const resTitle = document.getElementById("resultTitle");
      const resMeta = document.getElementById("resultMeta");
      const resList = document.getElementById("resultList");

      if (endpoint === "/check") {
        box.className = "box compact-result-box banner-info";
        if (checkBar) {
          checkBar.style.display = "flex";
          const pill = document.getElementById("resultPill");
          if (pill) {
            pill.className = "result-pill pill-waiting";
            pill.textContent = "⏳ CHECKING...";
          }
          const summary = document.getElementById("resultSummaryText");
          if (summary) summary.textContent = `${payload.user} —[ ${payload.relation} ]—> ${payload.object}`;
          const dur = document.getElementById("resultDurationBadge");
          if (dur) dur.textContent = "";
        }
        if (resTitle) resTitle.style.display = "none";
        if (resMeta) resMeta.style.display = "none";
        if (resList) resList.style.display = "none";
      } else {
        box.className = "box banner-info";
        if (checkBar) checkBar.style.display = "none";
        if (resTitle) {
          resTitle.style.display = "block";
          resTitle.textContent = "Выполняется запрос к OpenFGA...";
        }
        if (resMeta) {
          resMeta.style.display = "block";
          resMeta.textContent = msg;
        }
        if (resList) {
          resList.style.display = "block";
          resList.textContent = "Ожидание ответа сервера...";
        }
      }

      const explBox = document.getElementById("resultExplanationBox");
      if (explBox) {
        explBox.style.display = "none";
        explBox.innerHTML = "";
      }

      const reqBadge = document.getElementById("reqBadge");
      if (reqBadge) reqBadge.textContent = `POST ${endpoint}`;

      const reqPdpBadge = document.getElementById("reqPdpBadge");
      if (reqPdpBadge) {
        let pdpRoute = "/stores/{store_id}/check";
        if (endpoint === "/list-objects") pdpRoute = "/stores/{store_id}/list-objects";
        else if (endpoint === "/list-users") pdpRoute = "/stores/{store_id}/list-users";
        else if (endpoint === "/batch-check") pdpRoute = "/stores/{store_id}/batch-check";
        reqPdpBadge.textContent = `OpenFGA: POST ${pdpRoute}`;
      }

      const reqModeBadge = document.getElementById("reqModeBadge");
      if (reqModeBadge) {
        reqModeBadge.className = "badge-preview-sent";
        reqModeBadge.innerHTML = "⏳ Отправка запроса...";
      }

      const jsonReq = document.getElementById("jsonRequest");
      if (jsonReq) jsonReq.textContent = JSON.stringify(payload, null, 2);

      const resBadge = document.getElementById("resBadge");
      if (resBadge) {
        resBadge.className = "badge-status badge-status-waiting";
        resBadge.textContent = "⏳ Выполняется...";
      }

      const resDuration = document.getElementById("resDuration");
      if (resDuration) resDuration.textContent = "";

      const jsonRes = document.getElementById("jsonResponse");
      if (jsonRes) jsonRes.textContent = "// Ожидание ответа от OpenFGA...";
    }

    function showError(msg, endpoint, payload) {
      const box = document.getElementById("resultBox");
      box.style.display = "block";
      box.className = "box banner-deny";

      const checkBar = document.getElementById("resultCheckBar");
      if (checkBar) checkBar.style.display = "none";

      const resTitle = document.getElementById("resultTitle");
      if (resTitle) {
        resTitle.style.display = "block";
        resTitle.textContent = "Ошибка выполнения запроса";
      }
      const resMeta = document.getElementById("resultMeta");
      if (resMeta) {
        resMeta.style.display = "block";
        resMeta.textContent = "";
      }
      const resList = document.getElementById("resultList");
      if (resList) {
        resList.style.display = "block";
        resList.textContent = msg;
      }

      const explBox = document.getElementById("resultExplanationBox");
      if (explBox) {
        explBox.style.display = "none";
        explBox.innerHTML = "";
      }

      const reqModeBadge = document.getElementById("reqModeBadge");
      if (reqModeBadge) {
        reqModeBadge.className = "badge-preview-sent";
        reqModeBadge.innerHTML = "❌ Ошибка вызова";
      }

      const resBadge = document.getElementById("resBadge");
      if (resBadge) {
        resBadge.className = "badge-status badge-status-err";
        resBadge.textContent = "Error";
      }

      const resDuration = document.getElementById("resDuration");
      if (resDuration) resDuration.textContent = "";

      const jsonRes = document.getElementById("jsonResponse");
      if (jsonRes) jsonRes.textContent = JSON.stringify({ error: msg }, null, 2);
    }

    function renderCurrentTable() {
      if (!tables) return;
      const tableName = document.getElementById("tableSelect").value;
      const rows = tables[tableName] || [];
      const filter = document.getElementById("filterInput").value.toLowerCase().trim();

      const filtered = filter 
        ? rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(filter)))
        : rows;

      document.getElementById("rowsCount").textContent = "Строк: " + filtered.length + " из " + rows.length;

      if (filtered.length === 0) {
        document.getElementById("tableHead").innerHTML = "";
        document.getElementById("tableBody").innerHTML = "<tr><td colspan='10'>Нет данных</td></tr>";
        return;
      }

      const columns = Object.keys(rows[0]);
      document.getElementById("tableHead").innerHTML = "<tr>" + columns.map(c => "<th>" + c + "</th>").join("") + "</tr>";
      document.getElementById("tableBody").innerHTML = filtered.map(r => 
        "<tr>" + columns.map(c => "<td>" + (r[c] || "") + "</td>").join("") + "</tr>"
      ).join("");
    }

    // -------------------------------------------------------------
    // ИНТЕРАКТИВНЫЙ ГРАФ МОДЕЛИ OPENFGA И ВИЗУАЛИЗАЦИЯ ПУТИ
    // -------------------------------------------------------------
    const MODEL_GRAPH_NODES = {
      Divisions:   { id: "Divisions",   x: 200, y: 110, label: "Divisions",   sub: "Подразделения",   color: "#8b5cf6" },
      Staffs:      { id: "Staffs",      x: 490, y: 110, label: "Staffs",      sub: "Штатные единицы", color: "#06b6d4" },
      Professions: { id: "Professions", x: 780, y: 110, label: "Professions", sub: "Профессии",       color: "#10b981" },
      Employees:   { id: "Employees",   x: 280, y: 380, label: "Employees",   sub: "Сотрудники (↺ Замещения)", color: "#3b82f6" },
      Roles:       { id: "Roles",       x: 700, y: 380, label: "Roles",       sub: "Роли доступа",    color: "#f59e0b" }
    };

    const MODEL_GRAPH_EDGES = [
      {
        id: "divisions-staffs",
        from: "Divisions", to: "Staffs", relation: "direct_staff", label: "direct_staff",
        getPath: () => ({ d: "M 270 100 L 420 100", lx: 345, ly: 88 })
      },
      {
        id: "staffs-divisions",
        from: "Staffs", to: "Divisions", relation: "division", label: "division",
        getPath: () => ({ d: "M 420 120 L 270 120", lx: 345, ly: 135 })
      },
      {
        id: "staffs-professions",
        from: "Staffs", to: "Professions", relation: "profession", label: "profession",
        getPath: () => ({ d: "M 560 100 L 710 100", lx: 635, ly: 88 })
      },
      {
        id: "professions-staffs",
        from: "Professions", to: "Staffs", relation: "staff", label: "staff",
        getPath: () => ({ d: "M 710 120 L 560 120", lx: 635, ly: 135 })
      },
      {
        id: "divisions-divisions",
        from: "Divisions", to: "Divisions", relation: "descendant", label: "descendant", isSelfLoop: true,
        getPath: () => ({ d: "M 130 100 C 60 40, 60 180, 130 120", lx: 75, ly: 110 })
      },
      {
        id: "divisions-employees",
        from: "Divisions", to: "Employees", relation: "direct_employee", label: "direct_employee",
        getPath: () => ({ d: "M 210 134 L 260 356", lx: 220, ly: 245 })
      },
      {
        id: "employees-divisions",
        from: "Employees", to: "Divisions", relation: "can_use", label: "can_use / division",
        getPath: () => ({ d: "M 240 356 Q 160 250 190 134", lx: 180, ly: 245 })
      },
      {
        id: "staffs-employees",
        from: "Staffs", to: "Employees", relation: "employee", label: "employee",
        getPath: () => ({ d: "M 460 134 L 310 356", lx: 375, ly: 235 })
      },
      {
        id: "employees-staffs",
        from: "Employees", to: "Staffs", relation: "staff", label: "staff",
        getPath: () => ({ d: "M 330 356 Q 420 260 480 134", lx: 415, ly: 255 })
      },
      {
        id: "employees-employees",
        from: "Employees", to: "Employees", relation: "replaces", label: "replaces / substitute", isSelfLoop: true,
        getPath: () => ({ d: "M 210 370 C 130 310, 130 450, 210 390", lx: 145, ly: 380 })
      },
      {
        id: "employees-roles",
        from: "Employees", to: "Roles", relation: "can_use", label: "can_use / assignee",
        getPath: () => ({ d: "M 350 370 L 630 370", lx: 490, ly: 358 })
      },
      {
        id: "roles-employees",
        from: "Roles", to: "Employees", relation: "direct_assignee", label: "direct_assignee",
        getPath: () => ({ d: "M 630 390 L 350 390", lx: 490, ly: 405 })
      },
      {
        id: "staffs-roles",
        from: "Staffs", to: "Roles", relation: "staff_assignee", label: "staff_assignee",
        getPath: () => ({ d: "M 540 134 L 680 356", lx: 620, ly: 245 })
      },
      {
        id: "divisions-roles",
        from: "Divisions", to: "Roles", relation: "division_assignee", label: "division_assignee",
        getPath: () => ({ d: "M 270 134 Q 480 300 640 360", lx: 480, ly: 315 })
      },
      {
        id: "employees-professions",
        from: "Employees", to: "Professions", relation: "direct_profession", label: "direct_profession",
        getPath: () => ({ d: "M 350 365 Q 520 200 720 134", lx: 535, ly: 200 })
      }
    ];

    let currentGraphMode = "model";
    let currentTrace = null;

    let fgaActiveTypeFilter = 'all';
    let jsonActiveTypeFilter = 'all';

    function switchGraphMode(mode) {
      currentGraphMode = mode;
      const btnModel = document.getElementById("btnGraphModel");
      const btnEntity = document.getElementById("btnGraphEntity");
      const btnFga = document.getElementById("btnGraphFga");
      const btnJson = document.getElementById("btnGraphJson");
      const svgCanvas = document.querySelector(".graph-canvas-wrapper");
      const breadcrumb = document.getElementById("graphPathBreadcrumb");
      const legend = document.querySelector(".graph-legend");
      const fgaView = document.getElementById("graphFgaView");
      const jsonView = document.getElementById("graphJsonView");

      [btnModel, btnEntity, btnFga, btnJson].forEach(b => b && b.classList.remove("active"));

      if (mode === "fga") {
        if (btnFga) btnFga.classList.add("active");
        if (svgCanvas) svgCanvas.style.display = "none";
        if (breadcrumb) breadcrumb.style.display = "none";
        if (legend) legend.style.display = "none";
        if (jsonView) jsonView.style.display = "none";
        if (fgaView) fgaView.style.display = "block";
        renderFgaModelView();
      } else if (mode === "json") {
        if (btnJson) btnJson.classList.add("active");
        if (svgCanvas) svgCanvas.style.display = "none";
        if (breadcrumb) breadcrumb.style.display = "none";
        if (legend) legend.style.display = "none";
        if (fgaView) fgaView.style.display = "none";
        if (jsonView) jsonView.style.display = "block";
        renderJsonModelView();
      } else {
        if (mode === "model" && btnModel) btnModel.classList.add("active");
        if (mode === "entity" && btnEntity) btnEntity.classList.add("active");
        if (svgCanvas) svgCanvas.style.display = "block";
        if (breadcrumb) breadcrumb.style.display = "flex";
        if (legend) legend.style.display = "flex";
        if (fgaView) fgaView.style.display = "none";
        if (jsonView) jsonView.style.display = "none";
        drawGraph();
      }
    }

    function renderFgaModelView() {
      const pre = document.getElementById("fgaModelPre");
      const badge = document.getElementById("fgaStatsBadge");
      if (!pre) return;

      if (!modelFga) {
        pre.textContent = "# model.fga загружается...";
        fetch(`${API_BASE}/model.fga`)
          .then(r => r.text())
          .then(text => {
            modelFga = text;
            renderFgaModelView();
          })
          .catch(e => {
            pre.textContent = "# Ошибка загрузки model.fga: " + e.message;
          });
        return;
      }

      const totalLines = modelFga.split("\n").length;
      if (badge) {
        badge.textContent = `Типов: 7 | Строк: ${totalLines} | Схема: 1.1`;
      }

      const searchVal = (document.getElementById("fgaSearchInput")?.value || "").trim().toLowerCase();
      let displayedText = modelFga;

      if (fgaActiveTypeFilter !== "all") {
        const regex = new RegExp(`(# =+[\\s\\S]*?type\\s+${fgaActiveTypeFilter}\\b[\\s\\S]*?)(?=\\n# =|\\ntype\\s+|$)`, 'i');
        const match = modelFga.match(regex);
        if (match) {
          displayedText = match[1].trim();
        } else {
          const regex2 = new RegExp(`(type\\s+${fgaActiveTypeFilter}\\b[\\s\\S]*?)(?=\\ntype\\s+|$)`, 'i');
          const m2 = modelFga.match(regex2);
          if (m2) displayedText = m2[1].trim();
        }
      }

      pre.innerHTML = syntaxHighlightFga(displayedText, searchVal);
    }

    function filterFgaType(type) {
      fgaActiveTypeFilter = type;
      const pills = document.querySelectorAll("#fgaTypePills button");
      pills.forEach(p => {
        if (p.textContent.includes(type) || (type === 'all' && p.textContent.includes('Весь файл'))) {
          p.classList.add("active");
        } else {
          p.classList.remove("active");
        }
      });
      renderFgaModelView();
    }

    function filterFgaModelView() {
      renderFgaModelView();
    }

    function copyModelFga() {
      if (!modelFga) return;
      navigator.clipboard.writeText(modelFga).then(() => {
        alert("Официальная схема model.fga (OpenFGA Schema 1.1) скопирована в буфер обмена!");
      }).catch(() => {
        prompt("Скопируйте FGA модели вручную:", modelFga);
      });
    }

    function syntaxHighlightFga(fgaStr, searchHighlight = "") {
      const lines = fgaStr.split("\n");
      const highlightedLines = lines.map(line => {
        let l = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const commentIdx = l.indexOf("#");
        let commentPart = "";
        let codePart = l;
        if (commentIdx !== -1) {
          codePart = l.substring(0, commentIdx);
          commentPart = '<span style="color: #64748b; font-style: italic;">' + l.substring(commentIdx) + '</span>';
        }

        codePart = codePart.replace(/\b(model|schema|type|relations|define|from|or|and|but not)\b/g, '<span style="color: #f472b6; font-weight: 700;">$1</span>');
        codePart = codePart.replace(/(<span style="[^"]*">type<\/span>\s+)([A-Za-z0-9_]+)/g, '$1<span style="color: #38bdf8; font-weight: 700; text-decoration: underline;">$2</span>');
        codePart = codePart.replace(/\[([A-Za-z0-9_,\s#]+)\]/g, function(match, inner) {
          const types = inner.split(",").map(t => {
            const tr = t.trim();
            return `<span style="color: #4ade80; font-weight: 600;">${tr}</span>`;
          }).join(", ");
          return `[${types}]`;
        });
        codePart = codePart.replace(/(<span style="[^"]*">define<\/span>\s+)([A-Za-z0-9_]+)(:)/g, '$1<span style="color: #fbbf24; font-weight: 600;">$2</span>$3');

        return codePart + commentPart;
      });

      let result = highlightedLines.join("\n");
      if (searchHighlight) {
        const regex = new RegExp(`(${searchHighlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        result = result.replace(regex, '<mark style="background: #eab308; color: #000; padding: 1px 3px; border-radius: 2px;">$1</mark>');
      }
      return result;
    }

    function renderJsonModelView() {
      const pre = document.getElementById("jsonModelPre");
      const badge = document.getElementById("jsonStatsBadge");
      if (!pre) return;

      if (!modelJson) {
        pre.textContent = "// model.json еще загружается с сервера...";
        return;
      }

      const totalTypes = modelJson.type_definitions ? modelJson.type_definitions.length : 0;
      let totalRels = 0;
      (modelJson.type_definitions || []).forEach(t => {
        totalRels += Object.keys(t.relations || {}).length;
      });

      if (badge) {
        badge.textContent = `Типов: ${totalTypes} | Отношений: ${totalRels} | Схема: ${modelJson.schema_version || "1.1"}`;
      }

      const searchVal = (document.getElementById("jsonSearchInput")?.value || "").trim().toLowerCase();
      let displayedObj = modelJson;

      if (jsonActiveTypeFilter !== "all") {
        const typeDef = (modelJson.type_definitions || []).find(t => t.type === jsonActiveTypeFilter);
        displayedObj = {
          schema_version: modelJson.schema_version,
          type: jsonActiveTypeFilter,
          relations_count: typeDef ? Object.keys(typeDef.relations || {}).length : 0,
          type_definition: typeDef || null
        };
      }

      const text = JSON.stringify(displayedObj, null, 2);
      if (searchVal) {
        pre.innerHTML = syntaxHighlightJson(text, searchVal);
      } else {
        pre.innerHTML = syntaxHighlightJson(text);
      }
    }

    function filterJsonType(type) {
      jsonActiveTypeFilter = type;
      const pills = document.querySelectorAll("#jsonTypePills button");
      pills.forEach(p => {
        if (p.textContent.includes(type) || (type === 'all' && p.textContent.includes('Все типы'))) {
          p.classList.add("active");
        } else {
          p.classList.remove("active");
        }
      });
      renderJsonModelView();
    }

    function filterJsonModelView() {
      renderJsonModelView();
    }

    function copyModelJson() {
      if (!modelJson) return;
      const text = JSON.stringify(modelJson, null, 2);
      navigator.clipboard.writeText(text).then(() => {
        alert("Официальная схема model.json (OpenFGA Schema 1.1) скопирована в буфер обмена!");
      }).catch(() => {
        prompt("Скопируйте JSON модели вручную:", text);
      });
    }

    function syntaxHighlightJson(jsonStr, searchHighlight = "") {
      let escaped = jsonStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      let highlighted = escaped.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let cls = 'color: #38bdf8;';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'color: #f472b6; font-weight: 600;';
          } else {
            cls = 'color: #4ade80;';
          }
        } else if (/true|false/.test(match)) {
          cls = 'color: #fbbf24; font-weight: 600;';
        } else if (/null/.test(match)) {
          cls = 'color: #94a3b8; font-style: italic;';
        }
        return '<span style="' + cls + '">' + match + '</span>';
      });

      if (searchHighlight) {
        const regex = new RegExp(`(${searchHighlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        highlighted = highlighted.replace(regex, '<mark style="background: #eab308; color: #000; padding: 1px 3px; border-radius: 2px;">$1</mark>');
      }

      return highlighted;
    }

    function resetGraphHighlight() {
      currentTrace = null;
      const textEl = document.getElementById("graphPathText");
      if (textEl) {
        textEl.textContent = "Выполните проверку или поиск выше — здесь отобразится путь, по которому прошел запрос.";
        textEl.style.color = "#94a3b8";
      }
      drawGraph();
    }

    function updateGraphFromTrace(trace) {
      currentTrace = trace;
      const textEl = document.getElementById("graphPathText");
      if (textEl && trace) {
        textEl.innerHTML = trace.summary || "Путь определен";
        textEl.style.color = trace.allowed === false ? "#f87171" : "#38bdf8";
      }
      drawGraph();
    }
    window.updateGraphFromTrace = updateGraphFromTrace;
    window.applyGraphTrace = updateGraphFromTrace;

    function drawGraph() {
      const svg = document.getElementById("graphSvg");
      if (!svg) return;
      if (currentGraphMode === "model") {
        renderModelGraph(svg, currentTrace);
      } else {
        renderEntityChainGraph(svg, currentTrace);
      }
    }

    function onModelNodeClick(type) {
      switchTab("lookup");
      const typeSel = document.getElementById("lookupEntityType");
      if (typeSel) {
        typeSel.value = type;
        onLookupEntityTypeChange();
      }
      const section = document.getElementById("graphSection");
      if (section) {
        section.scrollIntoView({ behavior: "smooth" });
      }
    }

    function traceResolutionPath(params, tbls = {}) {
      const dataTables = (tbls && tbls.employees) ? tbls : (tables || {});
      const employees = dataTables.employees || [];
      const divisions = dataTables.divisions || [];
      const roles = dataTables.roles || [];
      const staffs = dataTables.staffs || [];
      const professions = dataTables.professions || [];

      const ctxTuples = params.contextualTuples || params.contextual_tuples || [];
      const replacings = [...(dataTables.replacings || [])];
      const grants = [...(dataTables.grants || [])];

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

      const {
        type,        // "check" | "lookup"
        user,         // e.g. "Employees:34491"
        relation,     // e.g. "can_use", "assignee", "staff", "descendant"
        object,       // e.g. "Roles:c66452e0...", "Divisions:755"
        userType,     // for lookup: "Employees", "Divisions", etc.
        items = [],   // for lookup: returned items array
        allowed = true
      } = params;
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



        function highlightSingleEdge(edgeIdx) {
      const svg = document.getElementById("graphSvg");
      if (!svg) return;
      svg.querySelectorAll(".svg-edge-path").forEach((p, idx) => {
        if (idx === edgeIdx) {
          p.classList.add("hovered");
          p.classList.remove("dimmed");
          p.setAttribute("marker-end", "url(#arrow-hover)");
        } else {
          p.classList.add("dimmed");
          p.classList.remove("hovered");
        }
      });
      svg.querySelectorAll(".svg-edge-label").forEach((l, idx) => {
        if (idx === edgeIdx) {
          l.classList.add("hovered");
          l.classList.remove("dimmed");
        } else {
          l.classList.add("dimmed");
          l.classList.remove("hovered");
        }
      });
      svg.querySelectorAll(".svg-edge-label-bg").forEach((bg, idx) => {
        if (idx === edgeIdx) {
          bg.classList.add("hovered");
          bg.classList.remove("dimmed");
        } else {
          bg.classList.add("dimmed");
          bg.classList.remove("hovered");
        }
      });
      const edge = MODEL_GRAPH_EDGES[edgeIdx];
      if (edge) {
        const nf = svg.querySelector(`.node-${edge.from}`);
        const nt = svg.querySelector(`.node-${edge.to}`);
        if (nf) nf.classList.add("hovered");
        if (nt) nt.classList.add("hovered");
      }
    }

    function highlightNodeConnections(nodeKey) {
      const svg = document.getElementById("graphSvg");
      if (!svg) return;
      MODEL_GRAPH_EDGES.forEach((edge, idx) => {
        const isConn = (edge.from === nodeKey || edge.to === nodeKey);
        const p = svg.querySelector(`.edge-path-${idx}`);
        const l = svg.querySelector(`.edge-label-${idx}`);
        const bg = svg.querySelector(`.edge-label-bg-${idx}`);
        if (p) {
          if (isConn) {
            p.classList.add("hovered");
            p.classList.remove("dimmed");
            p.setAttribute("marker-end", "url(#arrow-hover)");
          } else {
            p.classList.add("dimmed");
            p.classList.remove("hovered");
          }
        }
        if (l) {
          if (isConn) { l.classList.add("hovered"); l.classList.remove("dimmed"); }
          else { l.classList.add("dimmed"); l.classList.remove("hovered"); }
        }
        if (bg) {
          if (isConn) { bg.classList.add("hovered"); bg.classList.remove("dimmed"); }
          else { bg.classList.add("dimmed"); bg.classList.remove("hovered"); }
        }
      });
      const nodeEl = svg.querySelector(`.node-${nodeKey}`);
      if (nodeEl) nodeEl.classList.add("hovered");
    }

    function unhighlightGraph() {
      const svg = document.getElementById("graphSvg");
      if (!svg) return;
      const hasActiveTrace = Boolean(currentTrace && currentTrace.modelSteps && currentTrace.modelSteps.length > 0);
      
      svg.querySelectorAll(".svg-edge-path").forEach(p => {
        p.classList.remove("hovered");
        const isActive = p.classList.contains("active") || p.classList.contains("active-denied");
        const isDenied = p.classList.contains("active-denied");
        if (hasActiveTrace) {
          if (!isActive) {
            p.classList.add("dimmed");
            p.setAttribute("marker-end", "url(#arrow)");
          } else {
            p.setAttribute("marker-end", isDenied ? "url(#arrow-denied)" : "url(#arrow-active)");
          }
        } else {
          p.classList.remove("dimmed");
          p.setAttribute("marker-end", "url(#arrow)");
        }
      });

      svg.querySelectorAll(".svg-edge-label").forEach(l => {
        l.classList.remove("hovered");
        if (hasActiveTrace) {
          if (!l.classList.contains("active")) {
            l.classList.add("dimmed");
          }
        } else {
          l.classList.remove("dimmed");
        }
      });

      svg.querySelectorAll(".svg-edge-label-bg").forEach(bg => {
        bg.classList.remove("hovered");
        if (hasActiveTrace) {
          if (!bg.classList.contains("active")) {
            bg.classList.add("dimmed");
          }
        } else {
          bg.classList.remove("dimmed");
        }
      });

      svg.querySelectorAll(".svg-node").forEach(n => {
        n.classList.remove("hovered");
      });
    }

    function renderModelGraph(svg, trace) {
      svg.innerHTML = `
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#64748b"/>
          </marker>
          <marker id="arrow-hover" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38bdf8"/>
          </marker>
          <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38bdf8"/>
          </marker>
          <marker id="arrow-denied" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444"/>
          </marker>
        </defs>
      `;

      const hasActiveTrace = Boolean(trace && trace.modelSteps && trace.modelSteps.length > 0);

      // Слой 1: Подложки-гало (Halo) для всех линий на самом нижнем уровне
      const gHalos = document.createElementNS("http://www.w3.org/2000/svg", "g");
      gHalos.setAttribute("id", "gHalos");

      // Слой 2: Видимые линии связей
      const gPaths = document.createElementNS("http://www.w3.org/2000/svg", "g");
      gPaths.setAttribute("id", "gPaths");

      // Слой 3: Плашки подписей (рендерится ПОВЕРХ ВСЕХ ЛИНИЙ, исключая наложение линий на текст)
      const gLabels = document.createElementNS("http://www.w3.org/2000/svg", "g");
      gLabels.setAttribute("id", "gLabels");

      MODEL_GRAPH_EDGES.forEach((edge, idx) => {
        let stepIdx = -1;
        let isActive = false;
        let isDenied = false;

        if (trace && trace.modelSteps) {
          const matchIdx = trace.modelSteps.findIndex(s => {
            const directMatch = (s.from === edge.from && s.to === edge.to);
            if (directMatch) return true;
            const hasDirectEdge = MODEL_GRAPH_EDGES.some(e => e.from === s.from && e.to === s.to);
            if (!hasDirectEdge && s.from === edge.to && s.to === edge.from) {
              return true;
            }
            return false;
          });
          if (matchIdx !== -1) {
            isActive = true;
            stepIdx = matchIdx + 1;
            isDenied = (trace.allowed === false);
          }
        }

        const { d, lx, ly } = edge.getPath();

        // 1. Подложка-гало (Halo) в Слой 1
        const halo = document.createElementNS("http://www.w3.org/2000/svg", "path");
        halo.setAttribute("d", d);
        halo.setAttribute("class", "svg-edge-halo");
        gHalos.appendChild(halo);

        // 2. Линия ветки в Слой 2
        const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathEl.setAttribute("d", d);
        let pathClass = `svg-edge-path edge-path-${idx}`;
        if (isActive) {
          pathClass += isDenied ? " active-denied" : " active";
        } else if (hasActiveTrace) {
          pathClass += " dimmed";
        }
        pathEl.setAttribute("class", pathClass);
        pathEl.setAttribute("marker-end", isActive ? (isDenied ? "url(#arrow-denied)" : "url(#arrow-active)") : "url(#arrow)");
        pathEl.addEventListener("mouseenter", () => {
          highlightSingleEdge(idx);
          if (!isActive) pathEl.setAttribute("marker-end", "url(#arrow-hover)");
        });
        pathEl.addEventListener("mouseleave", () => {
          unhighlightGraph();
        });
        gPaths.appendChild(pathEl);

        // Стабильный импульс: отдельный слой без маркера, чтобы стрелка не съезжала
        if (isActive) {
          const flowEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
          flowEl.setAttribute("d", d);
          flowEl.setAttribute("class", `svg-edge-flow edge-flow-${idx}` + (isDenied ? " active-denied" : ""));
          gPaths.appendChild(flowEl);
        }

        // 3. Плашка с подписью связи в Слой 3 (поверх линий)
        const gLabel = document.createElementNS("http://www.w3.org/2000/svg", "g");
        gLabel.setAttribute("class", `g-label g-label-${idx}`);
        gLabel.addEventListener("mouseenter", () => {
          highlightSingleEdge(idx);
          if (!isActive) pathEl.setAttribute("marker-end", "url(#arrow-hover)");
        });
        gLabel.addEventListener("mouseleave", () => {
          unhighlightGraph();
        });

        const textWidth = Math.max(edge.label.length * 7 + 16, 54);

        const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bgRect.setAttribute("x", lx - textWidth / 2);
        bgRect.setAttribute("y", ly - 10);
        bgRect.setAttribute("width", textWidth);
        bgRect.setAttribute("height", 20);
        bgRect.setAttribute("rx", 5);
        bgRect.setAttribute("class", `svg-edge-label-bg edge-label-bg-${idx}` + (isActive ? " active" : "") + (!isActive && hasActiveTrace ? " dimmed" : ""));
        gLabel.appendChild(bgRect);

        const labelText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        labelText.setAttribute("x", lx);
        labelText.setAttribute("y", ly + 4);
        labelText.setAttribute("text-anchor", "middle");
        labelText.setAttribute("class", `svg-edge-label edge-label-${idx}` + (isActive ? " active" : "") + (!isActive && hasActiveTrace ? " dimmed" : ""));
        labelText.textContent = edge.label;
        gLabel.appendChild(labelText);

        if (isActive && stepIdx > 0) {
          const badgeCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          badgeCircle.setAttribute("cx", lx - textWidth / 2 - 2);
          badgeCircle.setAttribute("cy", ly);
          badgeCircle.setAttribute("r", 9);
          badgeCircle.setAttribute("class", "step-badge-circle");
          if (isDenied) badgeCircle.setAttribute("fill", "#ef4444");
          gLabel.appendChild(badgeCircle);

          const badgeText = document.createElementNS("http://www.w3.org/2000/svg", "text");
          badgeText.setAttribute("x", lx - textWidth / 2 - 2);
          badgeText.setAttribute("y", ly + 3.5);
          badgeText.setAttribute("text-anchor", "middle");
          badgeText.setAttribute("class", "step-badge-text");
          badgeText.textContent = stepIdx;
          gLabel.appendChild(badgeText);
        }

        gLabels.appendChild(gLabel);
      });

      svg.appendChild(gHalos);
      svg.appendChild(gPaths);
      svg.appendChild(gLabels);

      // Слой 4: Узлы модели на самом верхнем уровне
      const gNodes = document.createElementNS("http://www.w3.org/2000/svg", "g");
      gNodes.setAttribute("id", "gNodes");

      Object.keys(MODEL_GRAPH_NODES).forEach(key => {
        const node = MODEL_GRAPH_NODES[key];
        const isActive = trace && trace.modelSteps && trace.modelSteps.some(s => s.from === key || s.to === key);
        const count = (tables && tables[key.toLowerCase()] ? tables[key.toLowerCase()].length : 0);

        const gNode = document.createElementNS("http://www.w3.org/2000/svg", "g");
        gNode.setAttribute("class", `svg-node node-${key}` + (isActive ? " active" : ""));
        gNode.setAttribute("onclick", `onModelNodeClick('${key}')`);
        gNode.addEventListener("mouseenter", () => highlightNodeConnections(key));
        gNode.addEventListener("mouseleave", () => unhighlightGraph());

        // Простой аккуратный прямоугольник карточки без прыжков и пульсаций
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", node.x - 70);
        rect.setAttribute("y", node.y - 24);
        rect.setAttribute("width", 140);
        rect.setAttribute("height", 48);
        rect.setAttribute("rx", 6);
        rect.setAttribute("fill", "#1e293b");
        rect.setAttribute("stroke", isActive ? (trace.allowed === false ? "#ef4444" : "#38bdf8") : "#334155");
        rect.setAttribute("stroke-width", isActive ? 2.5 : 1.5);
        rect.setAttribute("class", "svg-node-rect");
        gNode.appendChild(rect);

        // Цветовая полоска типа сущности на левом ребре
        const stripe = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        stripe.setAttribute("x", node.x - 70);
        stripe.setAttribute("y", node.y - 24);
        stripe.setAttribute("width", 5);
        stripe.setAttribute("height", 48);
        stripe.setAttribute("rx", 2);
        stripe.setAttribute("fill", node.color);
        gNode.appendChild(stripe);

        // Название типа (латиница)
        const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
        title.setAttribute("x", node.x - 55);
        title.setAttribute("y", node.y - 3);
        title.setAttribute("fill", "#f8fafc");
        title.setAttribute("font-size", "13");
        title.setAttribute("font-weight", "700");
        title.textContent = node.label;
        gNode.appendChild(title);

        // Описание типа (русский язык)
        const sub = document.createElementNS("http://www.w3.org/2000/svg", "text");
        sub.setAttribute("x", node.x - 55);
        sub.setAttribute("y", node.y + 14);
        sub.setAttribute("fill", "#94a3b8");
        sub.setAttribute("font-size", "10.5");
        sub.textContent = node.sub;
        gNode.appendChild(sub);

        // Компактный счетчик строк в таблице
        if (count > 0) {
          const pill = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          pill.setAttribute("x", node.x + 36);
          pill.setAttribute("y", node.y - 19);
          pill.setAttribute("width", 28);
          pill.setAttribute("height", 16);
          pill.setAttribute("rx", 4);
          pill.setAttribute("fill", "#334155");
          gNode.appendChild(pill);

          const pillText = document.createElementNS("http://www.w3.org/2000/svg", "text");
          pillText.setAttribute("x", node.x + 50);
          pillText.setAttribute("y", node.y - 7);
          pillText.setAttribute("fill", "#cbd5e1");
          pillText.setAttribute("font-size", "9.5");
          pillText.setAttribute("font-weight", "700");
          pillText.setAttribute("text-anchor", "middle");
          pillText.textContent = count;
          gNode.appendChild(pillText);
        }

        gNodes.appendChild(gNode);
      });
      svg.appendChild(gNodes);
    }

    function renderEntityChainGraph(svg, trace) {
      svg.innerHTML = `
        <defs>
          <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38bdf8"/>
          </marker>
          <marker id="arrow-denied" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444"/>
          </marker>
        </defs>
      `;

      if (!trace || !trace.nodes || trace.nodes.length === 0) {
        const gEmpty = document.createElementNS("http://www.w3.org/2000/svg", "g");
        gEmpty.innerHTML = `
          <rect x="240" y="170" width="480" height="110" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
          <text x="480" y="215" text-anchor="middle" fill="#f8fafc" font-size="14" font-weight="700">Цепочка разрешения пуста</text>
          <text x="480" y="245" text-anchor="middle" fill="#94a3b8" font-size="12">Выполните проверку прав (Check) или поиск (Lookup) выше для построения пути</text>
        `;
        svg.appendChild(gEmpty);
        return;
      }

      const nodes = trace.nodes;
      const edges = trace.edges || [];

      // 1. Вычисляем топологический слой (колонку X) для каждого узла
      const inDegree = {};
      nodes.forEach(n => { inDegree[n.id] = 0; });
      edges.forEach(e => {
        if (inDegree[e.to] !== undefined) inDegree[e.to]++;
      });

      const layers = {};
      nodes.forEach(n => { layers[n.id] = 0; });

      // Назначаем слой: корень = 0, далее layer[to] = max(layer[to], layer[from] + 1)
      for (let pass = 0; pass < nodes.length; pass++) {
        let changed = false;
        edges.forEach(e => {
          if (layers[e.from] !== undefined && layers[e.to] !== undefined) {
            const nextL = layers[e.from] + 1;
            if (nextL > layers[e.to]) {
              layers[e.to] = nextL;
              changed = true;
            }
          }
        });
        if (!changed) break;
      }

      const maxLayer = Math.max(0, ...Object.values(layers));
      const colCount = maxLayer + 1;

      // Группируем узлы по слоям
      const nodesByLayer = {};
      for (let l = 0; l <= maxLayer; l++) {
        nodesByLayer[l] = [];
      }
      nodes.forEach(n => {
        const l = layers[n.id] || 0;
        nodesByLayer[l].push(n);
      });

      // 2. Рассчитываем координаты X и Y для каждого узла
      const cardW = Math.min(185, Math.max(120, Math.floor(750 / colCount)));
      const cardH = 74;
      const startX = 45;
      const endX = 915;
      const colSpacing = maxLayer > 0 ? (endX - startX - cardW) / maxLayer : 0;

      const nodeCoords = {};

      for (let l = 0; l <= maxLayer; l++) {
        const colNodes = nodesByLayer[l];
        const nx = colCount === 1 ? 480 : startX + cardW / 2 + l * colSpacing;
        const K = colNodes.length;

        if (K === 1) {
          let ny = 240;
          const pEdges = edges.filter(e => e.to === colNodes[0].id);
          if (pEdges.length === 1 && nodeCoords[pEdges[0].from]) {
            const parentY = nodeCoords[pEdges[0].from].y;
            if (Math.abs(parentY - 240) > 20) {
              ny = parentY;
            }
          }
          nodeCoords[colNodes[0].id] = { x: nx, y: ny };
        } else {
          const spacingY = Math.min(150, 360 / Math.max(1, K - 1));
          const startY = 240 - ((K - 1) * spacingY) / 2;
          colNodes.forEach((n, idx) => {
            nodeCoords[n.id] = { x: nx, y: startY + idx * spacingY };
          });
        }
      }

      // 3. Рендеринг карточек узлов
      nodes.forEach(n => {
        const pos = nodeCoords[n.id];
        if (!pos) return;
        const { x: nx, y: ny } = pos;

        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("class", "svg-node active");

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", nx - cardW / 2);
        rect.setAttribute("y", ny - cardH / 2);
        rect.setAttribute("width", cardW);
        rect.setAttribute("height", cardH);
        rect.setAttribute("rx", 6);
        rect.setAttribute("fill", "#1e293b");
        rect.setAttribute("stroke", trace.allowed === false ? "#ef4444" : "#38bdf8");
        rect.setAttribute("stroke-width", "2");
        g.appendChild(rect);

        const roleTag = n.roleTag || n.type || "Узел";
        const tagRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        tagRect.setAttribute("x", nx - cardW / 2 + 10);
        tagRect.setAttribute("y", ny - cardH / 2 + 10);
        tagRect.setAttribute("width", roleTag.length * 6.8 + 14);
        tagRect.setAttribute("height", 16);
        tagRect.setAttribute("rx", 4);
        tagRect.setAttribute("fill", "#0284c7");
        g.appendChild(tagRect);

        const tagText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        tagText.setAttribute("x", nx - cardW / 2 + 17);
        tagText.setAttribute("y", ny - cardH / 2 + 22);
        tagText.setAttribute("fill", "#ffffff");
        tagText.setAttribute("font-size", "9.5");
        tagText.setAttribute("font-weight", "700");
        tagText.textContent = roleTag;
        g.appendChild(tagText);

        const idText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        idText.setAttribute("x", nx - cardW / 2 + 12);
        idText.setAttribute("y", ny + 8);
        idText.setAttribute("fill", "#f8fafc");
        idText.setAttribute("font-size", "12");
        idText.setAttribute("font-weight", "700");
        idText.textContent = (n.id.length > 22 ? n.id.slice(0, 22) + "..." : n.id);
        g.appendChild(idText);

        const descText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        descText.setAttribute("x", nx - cardW / 2 + 12);
        descText.setAttribute("y", ny + 26);
        descText.setAttribute("fill", "#94a3b8");
        descText.setAttribute("font-size", "10");
        const cleanLabel = (n.label || "").replace(n.id, "").replace(" — ", "");
        descText.textContent = (cleanLabel.length > 25 ? cleanLabel.slice(0, 25) + "..." : cleanLabel) || n.label;
        g.appendChild(descText);

        svg.appendChild(g);
      });

      // 4. Рендеринг связей (рёбер) с плавными кривыми Безье
      edges.forEach((e, idx) => {
        const fromPos = nodeCoords[e.from];
        const toPos = nodeCoords[e.to];
        if (!fromPos || !toPos) return;

        const x1 = fromPos.x + cardW / 2;
        const y1 = fromPos.y;
        const x2 = toPos.x - cardW / 2;
        const y2 = toPos.y;

        let d = "";
        let mx = (x1 + x2) / 2;
        let my = (y1 + y2) / 2;

        if (Math.abs(y1 - y2) < 5) {
          d = `M ${x1} ${y1} L ${x2} ${y2}`;
          my = y1;
        } else {
          const dx = (x2 - x1) * 0.55;
          d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        }

        // Halo underlay
        const halo = document.createElementNS("http://www.w3.org/2000/svg", "path");
        halo.setAttribute("d", d);
        halo.setAttribute("class", "svg-edge-halo");
        svg.appendChild(halo);

        // Path
        const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathEl.setAttribute("d", d);
        pathEl.setAttribute("class", "svg-edge-path " + (trace.allowed === false ? "active-denied" : "active"));
        pathEl.setAttribute("marker-end", trace.allowed === false ? "url(#arrow-denied)" : "url(#arrow-active)");
        svg.appendChild(pathEl);

        const gLabel = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const tW = Math.max((e.relation || "").length * 7 + 16, 60);

        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bg.setAttribute("x", mx - tW / 2);
        bg.setAttribute("y", my - 12);
        bg.setAttribute("width", tW);
        bg.setAttribute("height", 22);
        bg.setAttribute("class", "svg-edge-label-bg active");
        gLabel.appendChild(bg);

        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", mx);
        txt.setAttribute("y", my + 3);
        txt.setAttribute("text-anchor", "middle");
        txt.setAttribute("class", "svg-edge-label active");
        txt.textContent = e.relation;
        gLabel.appendChild(txt);

        const step = e.step || idx + 1;
        const bCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        bCircle.setAttribute("cx", mx);
        bCircle.setAttribute("cy", my - 20);
        bCircle.setAttribute("r", 9);
        bCircle.setAttribute("class", "step-badge-circle");
        if (trace.allowed === false) bCircle.setAttribute("fill", "#ef4444");
        gLabel.appendChild(bCircle);

        const bText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        bText.setAttribute("x", mx);
        bText.setAttribute("y", my - 16.5);
        bText.setAttribute("text-anchor", "middle");
        bText.setAttribute("class", "step-badge-text");
        bText.textContent = step;
        gLabel.appendChild(bText);

        svg.appendChild(gLabel);
      });
    }

    window.addEventListener("DOMContentLoaded", loadData);
  