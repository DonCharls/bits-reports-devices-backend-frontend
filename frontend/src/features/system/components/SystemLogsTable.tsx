'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from 'date-fns';

interface SystemLog {
    id: number;
    level: 'INFO' | 'WARN' | 'ERROR';
    action: string;
    details: string;
    source: string;
    timestamp: string;
    metadata: any;
}

export function SystemLogsTable() {
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchLogs = async () => {
        try {
            const res = await fetch('/api/system/logs');
            const data = await res.json();
            if (data.success) {
                setLogs(data.logs);
            }
        } catch (error) {
            console.error('Failed to fetch system logs:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        // optionally poll every 30s
        const interval = setInterval(fetchLogs, 30000);
        return () => clearInterval(interval);
    }, []);

    const getLevelBadge = (level: string) => {
        switch (level) {
            case 'INFO': return <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">INFO</Badge>;
            case 'WARN': return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">WARN</Badge>;
            case 'ERROR': return <Badge variant="destructive">ERROR</Badge>;
            default: return <Badge variant="outline">{level}</Badge>;
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>System Audit Logs</CardTitle>
                <CardDescription>Recent background and manual sync events.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border max-h-[400px] overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[180px]">Time</TableHead>
                                <TableHead className="w-[100px]">Level</TableHead>
                                <TableHead className="w-[150px]">Action</TableHead>
                                <TableHead>Details</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading && logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                        Loading logs...
                                    </TableCell>
                                </TableRow>
                            ) : logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                        No recent system logs.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                logs.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell className="text-xs whitespace-nowrap">
                                            {format(new Date(log.timestamp || (log as any).createdAt || new Date()), "MMM d, HH:mm:ss")}
                                        </TableCell>
                                        <TableCell>{getLevelBadge(log.level)}</TableCell>
                                        <TableCell className="font-medium text-xs font-mono">{log.action}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {log.details}
                                            {log.metadata?.failedDevices?.length > 0 && (
                                                <div className="mt-1 text-xs text-red-600">
                                                    Failed devices: {log.metadata.failedDevices.map((d: any) => d.name).join(', ')}
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
