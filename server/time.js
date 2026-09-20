const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const isoWeek = require('dayjs/plugin/isoWeek');
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

const TZ = process.env.TZ || 'America/Sao_Paulo';

function now() {
  return dayjs().tz(TZ);
}

// Divide um intervalo [start, end] (strings ISO em UTC) em pedacos que nao
// cruzam a meia-noite no fuso TZ, retornando { dayKey: 'YYYY-MM-DD', hours }[]
function splitByDay(startIso, endIso) {
  const start = dayjs(startIso).tz(TZ);
  const end = dayjs(endIso).tz(TZ);
  const segments = [];
  let cursor = start;
  while (cursor.isBefore(end)) {
    const endOfDay = cursor.endOf('day');
    const segmentEnd = endOfDay.isBefore(end) ? endOfDay : end;
    const hours = segmentEnd.diff(cursor, 'second') / 3600;
    segments.push({ dayKey: cursor.format('YYYY-MM-DD'), hours });
    cursor = segmentEnd.add(1, 'millisecond');
  }
  return segments;
}

module.exports = { dayjs, TZ, now, splitByDay };
