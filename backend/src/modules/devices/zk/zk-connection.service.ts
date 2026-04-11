import { prisma } from '../../../shared/lib/prisma';
import { ZKDriver } from '../../../shared/lib/zk-driver';

export const getDriver = (ip?: string, port?: number): ZKDriver => {
    const resolvedIp = ip ?? process.env.ZK_HOST ?? '192.168.1.201';
    const resolvedPort = port ?? parseInt(process.env.ZK_PORT || '4370');
    const timeout = parseInt(process.env.ZK_TIMEOUT || '30000');
    return new ZKDriver(resolvedIp, resolvedPort, timeout);
};

export function zkErrMsg(err: any): string {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    if (err.err instanceof Error) return `${err.command || 'ZK'}: ${err.err.message}`;
    if (err.message) return err.message;
    return JSON.stringify(err);
}

export async function connectWithRetry(zk: ZKDriver, maxRetries: number = 2): Promise<void> {
    let lastError: any;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            await zk.connect();
            if (attempt > 1) console.log(`[ZK] Connected on attempt ${attempt}.`);
            return;
        } catch (err: any) {
            lastError = err;
            console.warn(`[ZK] Connection attempt ${attempt} failed: ${zkErrMsg(err)}`);
            if (attempt <= maxRetries) {
                console.log(`[ZK] Retrying in 2.5 s...`);
                await new Promise(r => setTimeout(r, 2500));
            }
        }
    }
    throw lastError;
}



