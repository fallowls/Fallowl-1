import { useQuery } from '@tanstack/react-query';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Info, ShieldAlert, Activity } from 'lucide-react';
import { format } from 'date-fns';

const SeverityBadge = ({ severity }: { severity: string }) => {
  switch (severity) {
    case 'critical':
      return <Badge variant="destructive" className="uppercase font-bold"><ShieldAlert className="w-3 h-3 mr-1" /> Critical</Badge>;
    case 'error':
      return <Badge variant="destructive" className="uppercase"><ShieldAlert className="w-3 h-3 mr-1" /> Error</Badge>;
    case 'warn':
      return <Badge variant="default" className="uppercase bg-yellow-500 text-white hover:bg-yellow-600 border-none"><AlertTriangle className="w-3 h-3 mr-1" /> Warning</Badge>;
    default:
      return <Badge variant="secondary" className="uppercase"><Info className="w-3 h-3 mr-1" /> Info</Badge>;
  }
};

export default function SecurityDashboard() {
  const { data: logs, isLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/audit-logs'],
  });

  if (isLoading) return <div className="p-8 text-center">Loading security events...</div>;

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Security Audit</h1>
          <p className="text-muted-foreground">Monitor infrastructure health and multi-tenant isolation events.</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="px-4 py-1"><Activity className="w-4 h-4 mr-2 text-green-500" /> System Active</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Alerts</CardTitle>
            <ShieldAlert className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{logs?.filter((l: any) => l.severity === 'critical').length || 0}</div>
            <p className="text-xs text-muted-foreground">Immediate attention required</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Security Events</CardTitle>
          <CardDescription>Real-time audit log of multi-tenant security operations.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs?.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs font-mono">
                    {format(new Date(log.createdAt), 'MMM dd, HH:mm:ss')}
                  </TableCell>
                  <TableCell>
                    <SeverityBadge severity={log.severity} />
                  </TableCell>
                  <TableCell className="font-medium">{log.eventType}</TableCell>
                  <TableCell>
                    {log.tenantId ? <Badge variant="outline">ID: {log.tenantId}</Badge> : 'System'}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={log.action}>
                    {log.action}
                  </TableCell>
                  <TableCell className="text-xs font-mono">{log.ipAddress || 'Internal'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
