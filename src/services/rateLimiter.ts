
import { getUsageStats, setUsageStats } from './storageService';

const MAX_Requests_PER_HOUR = 20;
const MAX_REQUESTS_PER_DAY = 100;

export interface UsageStats {
    date: string;       // YYYY-MM-DD
    hour: string;       // YYYY-MM-DD-HH
    dailyCount: number;
    hourlyCount: number;
}

const getCurrentStats = async (): Promise<UsageStats> => {
    const now = new Date();
    const dateKey = now.toISOString().split('T')[0];
    const hourKey = `${dateKey}-${now.getHours()}`;

    const stored = await getUsageStats();
    let stats: UsageStats = stored ? JSON.parse(stored) : {
        date: dateKey,
        hour: hourKey,
        dailyCount: 0,
        hourlyCount: 0
    };

    // Reset counters if time period changed
    if (stats.date !== dateKey) {
        stats = {
            date: dateKey,
            hour: hourKey,
            dailyCount: 0,
            hourlyCount: 0
        };
    } else if (stats.hour !== hourKey) {
        stats.hour = hourKey;
        stats.hourlyCount = 0;
    }

    return stats;
};

export const checkRateLimit = async (): Promise<void> => {
    const stats = await getCurrentStats();

    if (stats.dailyCount >= MAX_REQUESTS_PER_DAY) {
        throw new Error(`Daily limit reached (${MAX_REQUESTS_PER_DAY} requests). Please try again tomorrow.`);
    }

    if (stats.hourlyCount >= MAX_Requests_PER_HOUR) {
        throw new Error(`Hourly limit reached (${MAX_Requests_PER_HOUR} requests). Please wait a moment.`);
    }
};

export const incrementUsage = async (): Promise<void> => {
    const stats = await getCurrentStats();

    stats.dailyCount++;
    stats.hourlyCount++;

    await setUsageStats(JSON.stringify(stats));
};

export const getUsageDisplay = async (): Promise<{ daily: number, hourly: number, maxDaily: number, maxHourly: number }> => {
    const stats = await getCurrentStats();
    return {
        daily: stats.dailyCount,
        hourly: stats.hourlyCount,
        maxDaily: MAX_REQUESTS_PER_DAY,
        maxHourly: MAX_Requests_PER_HOUR
    };
};
