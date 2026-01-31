import { TimeCode } from './types';

export const parseTimeCode = (timeString: string, format: 'srt' | 'vtt'): TimeCode => {
  // SRT: 00:00:20,000
  // VTT: 00:00:20.000 or 00:20.000
  
  const separator = format === 'srt' ? ',' : '.';
  const parts = timeString.split(separator);
  let mainTime = parts[0];
  const ms = parseInt(parts[1]?.padEnd(3, '0') || '0', 10);

  const timeParts = mainTime.split(':').map(Number);
  
  let h = 0, m = 0, s = 0;
  if (timeParts.length === 3) {
    [h, m, s] = timeParts;
  } else if (timeParts.length === 2) {
    [m, s] = timeParts;
  }

  const totalMilliseconds = (h * 3600000) + (m * 60000) + (s * 1000) + ms;

  return {
    hours: h,
    minutes: m,
    seconds: s,
    milliseconds: ms,
    totalMilliseconds
  };
};

export const formatTimeCode = (time: TimeCode, format: 'srt' | 'vtt'): string => {
  const pad = (n: number, width: number = 2) => n.toString().padStart(width, '0');
  const separator = format === 'srt' ? ',' : '.';
  
  return `${pad(time.hours)}:${pad(time.minutes)}:${pad(time.seconds)}${separator}${pad(time.milliseconds, 3)}`;
};

export const msToTimeCode = (totalMs: number): TimeCode => {
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor(((totalMs % 3600000) % 60000) / 1000);
  const milliseconds = totalMs % 1000;

  return {
    hours,
    minutes,
    seconds,
    milliseconds,
    totalMilliseconds: totalMs
  };
};

export const adjustTime = (time: TimeCode, deltaSeconds: number): TimeCode => {
  const newTotal = Math.max(0, time.totalMilliseconds + (deltaSeconds * 1000));
  return msToTimeCode(newTotal);
};