(async () => {
  const USERS = [
    { login: "1731853", timeZone: "3", grade: "7" },
    { login: "1737543", timeZone: "2", grade: "8" },
    // { login: "1234567", timeZone: "0", grade: "" },
  ];

  const BASE_URL = "https://sbof-iam-prom.omega.sbrf.ru/core/api/constructor-user-service/v1/users";

  const DAYS_MON_TO_FRI = [1, 2, 3, 4, 5];

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function normalizeGrade(grade) {
    if (grade === null || grade === undefined || grade === "") return [];
    const g = String(grade).trim();
    if (g === "7") return ["EXPERT"];
    if (g === "8") return ["MENTOR"];
    if (g === "0") return [];
    return [];
  }

  function parseTimeZone(timeZone) {
    if (timeZone === null || timeZone === undefined || timeZone === "") {
      throw new Error("timeZone пустой или отсутствует");
    }

    const tz = Number(String(timeZone).replace(",", ".").trim());

    if (Number.isNaN(tz)) {
      throw new Error(`Некорректный timeZone: ${timeZone}`);
    }

    return tz;
  }

  function shiftLocalTimeToUtc(dayOfWeek, hour, minute, tzOffset) {
    let utcHourFloat = hour - tzOffset;
    let utcDay = dayOfWeek;

    while (utcHourFloat < 0) {
      utcHourFloat += 24;
      utcDay -= 1;
      if (utcDay < 1) utcDay = 7;
    }

    while (utcHourFloat >= 24) {
      utcHourFloat -= 24;
      utcDay += 1;
      if (utcDay > 7) utcDay = 1;
    }

    const utcHour = Math.floor(utcHourFloat);
    const utcMinute = minute;

    return {
      dayOfWeek: utcDay,
      time: `${pad2(utcHour)}:${pad2(utcMinute)}:00`
    };
  }

  function buildWorkingSchedule(timeZone) {
    const tz = parseTimeZone(timeZone);
    const schedule = [];

    for (const day of DAYS_MON_TO_FRI) {
      const workStart = shiftLocalTimeToUtc(day, 9, 0, tz);
      const lunchStart = shiftLocalTimeToUtc(day, 14, 0, tz);
      const lunchEnd = shiftLocalTimeToUtc(day, 16, 0, tz);
      const workEnd = shiftLocalTimeToUtc(day, 18, 0, tz);

      const dayBuckets = new Map();

      function ensureDay(targetDay) {
        if (!dayBuckets.has(targetDay)) {
          dayBuckets.set(targetDay, {
            dayOfWeek: targetDay,
            workStart: null,
            workEnd: null,
            lunchStart: null,
            lunchEnd: null
          });
        }
        return dayBuckets.get(targetDay);
      }

      ensureDay(workStart.dayOfWeek).workStart = workStart.time;
      ensureDay(workEnd.dayOfWeek).workEnd = workEnd.time;
      ensureDay(lunchStart.dayOfWeek).lunchStart = lunchStart.time;
      ensureDay(lunchEnd.dayOfWeek).lunchEnd = lunchEnd.time;

      for (const item of dayBuckets.values()) {
        schedule.push(item);
      }
    }

    const merged = new Map();

    for (const item of schedule) {
      if (!merged.has(item.dayOfWeek)) {
        merged.set(item.dayOfWeek, {
          dayOfWeek: item.dayOfWeek,
          workStart: item.workStart,
          workEnd: item.workEnd,
          lunchStart: item.lunchStart,
          lunchEnd: item.lunchEnd
        });
      } else {
        const existing = merged.get(item.dayOfWeek);
        if (item.workStart !== null) existing.workStart = item.workStart;
        if (item.workEnd !== null) existing.workEnd = item.workEnd;
        if (item.lunchStart !== null) existing.lunchStart = item.lunchStart;
        if (item.lunchEnd !== null) existing.lunchEnd = item.lunchEnd;
      }
    }

    return Array.from(merged.values())
      .filter(x => x.workStart || x.workEnd || x.lunchStart || x.lunchEnd)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  }

  async function patchJson(url, body) {
    const response = await fetch(url, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    let responseData = null;
    const text = await response.text();

    try {
      responseData = text ? JSON.parse(text) : null;
    } catch {
      responseData = text;
    }

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText} | ${typeof responseData === "string" ? responseData : JSON.stringify(responseData)}`
      );
    }

    return responseData;
  }

  async function processUser(user) {
    const login = user?.login?.trim?.() || user?.login;

    if (!login) {
      throw new Error("У пользователя отсутствует login");
    }

    const specializations = normalizeGrade(user.grade);
    const schedulePayload = buildWorkingSchedule(user.timeZone);

    const specializationUrl = `${BASE_URL}/${login}/specialization`;
    const workingScheduleUrl = `${BASE_URL}/${login}/working-schedule`;

    const specializationPayload = {
      specializations
    };

    const result = {
      login,
      timeZone: user.timeZone ?? "",
      grade: user.grade ?? "",
      specializationStatus: "PENDING",
      scheduleStatus: "PENDING",
      specializationError: "",
      scheduleError: ""
    };

    try {
      await patchJson(specializationUrl, specializationPayload);
      result.specializationStatus = "OK";
    } catch (e) {
      result.specializationStatus = "ERROR";
      result.specializationError = e.message;
    }

    try {
      await patchJson(workingScheduleUrl, schedulePayload);
      result.scheduleStatus = "OK";
    } catch (e) {
      result.scheduleStatus = "ERROR";
      result.scheduleError = e.message;
    }

    return {
      ...result,
      specializationPayload,
      schedulePayload
    };
  }

  const startedAt = new Date();
  const results = [];

  console.log(`Старт: ${startedAt.toLocaleString()}`);
  console.log(`Пользователей к обработке: ${USERS.length}`);

  for (let i = 0; i < USERS.length; i++) {
    const user = USERS[i];
    console.log(`\n[${i + 1}/${USERS.length}] Обрабатываю login=${user.login}`);

    try {
      const res = await processUser(user);
      results.push(res);

      console.log(
        `[${user.login}] specialization=${res.specializationStatus}, schedule=${res.scheduleStatus}`
      );

      if (res.specializationStatus !== "OK") {
        console.warn(`[${user.login}] Ошибка specialization: ${res.specializationError}`);
      }
      if (res.scheduleStatus !== "OK") {
        console.warn(`[${user.login}] Ошибка working-schedule: ${res.scheduleError}`);
      }
    } catch (e) {
      results.push({
        login: user.login || "",
        timeZone: user.timeZone || "",
        grade: user.grade || "",
        specializationStatus: "ERROR",
        scheduleStatus: "ERROR",
        specializationError: e.message,
        scheduleError: e.message
      });

      console.error(`[${user.login || "unknown"}] Критическая ошибка:`, e.message);
    }
  }

  const finishedAt = new Date();
  const okCount = results.filter(
    x => x.specializationStatus === "OK" && x.scheduleStatus === "OK"
  ).length;

  const partialCount = results.filter(
    x =>
      (x.specializationStatus === "OK" && x.scheduleStatus !== "OK") ||
      (x.specializationStatus !== "OK" && x.scheduleStatus === "OK")
  ).length;

  const failCount = results.filter(
    x => x.specializationStatus !== "OK" && x.scheduleStatus !== "OK"
  ).length;

  console.log("\n=== ИТОГ ===");
  console.log(`Старт: ${startedAt.toLocaleString()}`);
  console.log(`Финиш: ${finishedAt.toLocaleString()}`);
  console.log(`Успешно полностью: ${okCount}`);
  console.log(`Частично: ${partialCount}`);
  console.log(`Полностью с ошибкой: ${failCount}`);

  console.table(
    results.map(x => ({
      login: x.login,
      timeZone: x.timeZone,
      grade: x.grade,
      specializationStatus: x.specializationStatus,
      scheduleStatus: x.scheduleStatus,
      specializationError: x.specializationError,
      scheduleError: x.scheduleError
    }))
  );

  return results;
})();