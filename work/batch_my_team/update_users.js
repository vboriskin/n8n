/**
 * Запускать в консоли браузера, будучи авторизованным на sbof-iam-prom.omega.sbrf.ru
 *
 * Логика:
 *  1) PATCH /users/{login}/specialization
 *     grade=7 -> ["EXPERT"], grade=8 -> ["MENTOR"], иначе/0/пусто -> []
 *  2) PATCH /users/{login}/working-schedule
 *     расписание 09:00–18:00, обед 14:00–16:00 по локальному времени,
 *     на сервер уходит в UTC (вычитаем timeZone часов).
 */

(async () => {
  // ===== ВСТАВЬ СЮДА СПИСОК ПОЛЬЗОВАТЕЛЕЙ =====
  const users = [
    { login: "1731853", timeZone: "3", grade: "7" },
    { login: "1737543", timeZone: "2", grade: "8" },
  ];
  // ============================================

  const BASE_URL =
    "https://sbof-iam-prom.omega.sbrf.ru/core/api/constructor-user-service/v1/users";

  const pad = (n) => String(n).padStart(2, "0");

  const gradeToSpecializations = (grade) => {
    const g = String(grade ?? "").trim();
    if (g === "7") return ["EXPERT"];
    if (g === "8") return ["MENTOR"];
    return []; // 0, пусто, отсутствует, любое другое
  };

  // local HH:mm:ss -> UTC HH:mm:ss при заданном смещении в часах
  const toUtc = (time, tzOffsetHours) => {
    const [h, m, s] = time.split(":").map(Number);
    let total = h * 60 + m - Math.round(Number(tzOffsetHours) || 0) * 60;
    total = ((total % 1440) + 1440) % 1440;
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}:${pad(s || 0)}`;
  };

  const buildSchedule = (tz) => {
    const workStart = toUtc("09:00:00", tz);
    const workEnd = toUtc("18:00:00", tz);
    const lunchStart = toUtc("14:00:00", tz);
    const lunchEnd = toUtc("16:00:00", tz);
    return [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      workStart,
      workEnd,
      lunchStart,
      lunchEnd,
    }));
  };

  const patchJson = async (url, body) => {
    const res = await fetch(url, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    let text = "";
    try {
      text = await res.text();
    } catch (_) {}
    return { ok: res.ok, status: res.status, body: text };
  };

  const report = [];

  for (const u of users) {
    const { login, timeZone, grade } = u;
    const row = {
      login,
      grade: grade ?? "",
      timeZone: timeZone ?? "",
      specialization: "",
      specStatus: "",
      scheduleStatus: "",
      error: "",
    };

    // 1) specialization
    try {
      const specs = gradeToSpecializations(grade);
      row.specialization = specs.length ? specs.join(",") : "—";
      const r = await patchJson(`${BASE_URL}/${login}/specialization`, {
        specializations: specs,
      });
      row.specStatus = `${r.status} ${r.ok ? "OK" : "FAIL"}`;
      if (!r.ok) row.error += `spec: ${r.body?.slice(0, 200) || ""}; `;
    } catch (e) {
      row.specStatus = "NET ERR";
      row.error += `spec: ${e.message}; `;
    }

    // 2) working-schedule
    try {
      const schedule = buildSchedule(timeZone);
      const r = await patchJson(`${BASE_URL}/${login}/working-schedule`, schedule);
      row.scheduleStatus = `${r.status} ${r.ok ? "OK" : "FAIL"}`;
      if (!r.ok) row.error += `sch: ${r.body?.slice(0, 200) || ""}; `;
    } catch (e) {
      row.scheduleStatus = "NET ERR";
      row.error += `sch: ${e.message}; `;
    }

    report.push(row);
    console.log(
      `[${login}] spec ${row.specStatus} (${row.specialization})  |  schedule ${row.scheduleStatus}` +
        (row.error ? `  ERR: ${row.error}` : "")
    );
  }

  console.log("\n===== ИТОГ =====");
  console.table(report);
  window.__usersUpdateReport = report;
  console.log("Полный отчёт также сохранён в window.__usersUpdateReport");
})();
