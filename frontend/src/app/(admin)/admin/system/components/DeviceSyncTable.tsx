'use client';

import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { MonitorSmartphone, CloudOff } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface Device {
    id: number;
    name: string;
    ip: string;
    isActive: boolean;
    syncEnabled: boolean;
    lastSyncedAt: string | null;
    lastPolledAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
}

interface DeviceSyncTableProps {
    devices: Device[];
    loading: boolean;
    onDevicesChange: React.Dispatch<React.SetStateAction<Device[]>>;
}

export function DeviceSyncTable({ devices, loading, onDevicesChange }: DeviceSyncTableProps) {
    const { toast } = useToast();

    const toggleDeviceSync = async (id: number, currentEnabled: boolean) => {
        try {
            const res = await axios.patch(`/api/devices/${id}/toggle`, {}, { withCredentials: true });
            if (res.data.success) {
                onDevicesChange(prev => prev.map(d => d.id === id ? { ...d, syncEnabled: !currentEnabled } : d));
                toast({
                    title: `Device Sync ${!currentEnabled ? 'Enabled' : 'Disabled'}`,
                    description: `Cron sync will now ${!currentEnabled ? 'include' : 'skip'} this device.`,
                });
            }
        } catch (error: any) {
             toast({
                title: 'Toggle Failed',
                description: error.response?.data?.message || 'Failed to update device',
                variant: 'destructive',
            });
        }
    };

    if (loading) return <div>Loading devices...</div>;

    return (
        <Card>
            <CardHeader className="pb-4">
                <CardTitle className="text-xl flex items-center gap-2">
                    <MonitorSmartphone className="h-5 w-5 text-primary" />
                    Device Status & Sync Controls
                </CardTitle>
                <CardDescription>
                    Monitor connection status and individual device sync overrides. Changes here affect the next cron cycle.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Device Name</TableHead>
                            <TableHead>IP Address</TableHead>
                            <TableHead>Connection Health</TableHead>
                            <TableHead>Latest Attendance Log</TableHead>
                            <TableHead>Last Server Poll</TableHead>
                            <TableHead className="text-right">Include in Sync</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {devices.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                                    No devices found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            devices.map((device) => (
                                <TableRow key={device.id}>
                                    <TableCell className="font-medium">{device.name}</TableCell>
                                    <TableCell className="text-muted-foreground">{device.ip}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1.5 items-start">
                                            {device.isActive ? (
                                                <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                                                    <div className="mr-1 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                                    Online
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                                                    <CloudOff className="mr-1 h-3 w-3" />
                                                    Offline
                                                </Badge>
                                            )}
                                            {device.lastSyncStatus === 'FAILED' && (
                                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 items-center gap-1" title={device.lastSyncError || 'Sync failed'}>
                                                    Sync Failed
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {device.lastSyncedAt ? format(new Date(device.lastSyncedAt), 'PPp') : 'Never'}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {device.lastPolledAt ? format(new Date(device.lastPolledAt), 'PPp') : 'Never'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Switch 
                                            checked={device.syncEnabled}
                                            onCheckedChange={() => toggleDeviceSync(device.id, device.syncEnabled)}
                                            aria-label={`Toggle sync for ${device.name}`}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
