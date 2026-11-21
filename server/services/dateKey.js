function parseDateKey(dateKey) {
  if (typeof dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("Invalid puzzle date.");
  }

  const date = new Date(`${dateKey}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== dateKey
  ) {
    throw new Error("Invalid puzzle date.");
  }

  return date;
}

function getPreviousDateKeys(dateKey, count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("Date lookback must be a non-negative integer.");
  }

  const currentDate = parseDateKey(dateKey);
  const previousDates = [];

  for (let offset = count; offset > 0; offset--) {
    const previousDate = new Date(currentDate);
    previousDate.setUTCDate(previousDate.getUTCDate() - offset);
    previousDates.push(previousDate.toISOString().slice(0, 10));
  }

  return previousDates;
}

module.exports = {
  parseDateKey,
  getPreviousDateKeys
};
